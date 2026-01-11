"""
WhatsApp Chat Summarizer - Fixed for new Gemini model names (no 404)
Uses a currently supported model instead of deprecated `models/gemini-pro`.
"""

from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
import zipfile
import tempfile
import re
from datetime import datetime
from dotenv import load_dotenv

import google.generativeai as genai  # still supported, just use valid model name

load_dotenv()

app = Flask(__name__, 
            template_folder='../frontend',
            static_folder='../frontend',
            static_url_path='')
CORS(app)

# Load both API keys
API_KEY = os.getenv("GEMINI_API_KEY")
API_KEY_FALLBACK = os.getenv("GEMINI_API_KEY1")

if not API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set in environment variables (.env).")

# Configure Gemini with primary API key
genai.configure(api_key=API_KEY)

# Use a valid, supported model.
# Any of these are valid as of the latest docs:
# - "gemini-2.5-flash"
# - "gemini-2.0-flash"
# - "gemini-flash-latest"
# - "gemini-2.5-pro"
# Here we choose a fast, cheap model:
GEMINI_MODEL_NAME = "gemini-2.5-flash"  # no "models/" prefix needed with this SDK.[web:94][web:117]


# ------------- Robust WhatsApp parsing ------------- #

WHATSAPP_PATTERNS = [
    # Android style: 11/01/24, 10:05 pm - Name: Message
    r'^(\d{1,2}/\d{1,2}/\d{2,4}),?\s+(\d{1,2}:\d{2}(?:\s?[APMapm\.]{2,4})?)\s+-\s+([^:]+):\s+(.*)$',
    # iOS style: [11/01/24, 10:05:11 pm] Name: Message
    r'^\[?(\d{1,2}/\d{1,2}/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APMapm\.]{2,4})?)\]?\s+([^:]+):\s+(.*)$',
]

DATE_FORMATS = [
    "%d/%m/%Y",
    "%d/%m/%y",
    "%m/%d/%Y",
    "%m/%d/%y",
]

TIME_FORMATS = [
    "%H:%M",
    "%H:%M:%S",
    "%I:%M %p",
    "%I:%M:%S %p",
    "%I:%M%p",
]


class ChatMessage:
    def __init__(self, dt: datetime | None, sender: str, content: str):
        self.datetime_obj = dt
        self.sender = sender.strip()
        self.content = content.strip()

    def is_in_range(self, start_dt, end_dt):
        if not self.datetime_obj:
            return True
        return start_dt <= self.datetime_obj <= end_dt


def parse_datetime(date_str: str, time_str: str) -> datetime | None:
    date_str = date_str.strip()
    time_str = time_str.strip().replace(" ", " ")  # narrow no-break space to normal
    time_str = (
        time_str.replace(".", "")
        .replace("am", "AM")
        .replace("pm", "PM")
        .replace("Am", "AM")
        .replace("Pm", "PM")
    )
    for df in DATE_FORMATS:
        for tf in TIME_FORMATS:
            try:
                return datetime.strptime(f"{date_str} {time_str}", f"{df} {tf}")
            except ValueError:
                continue
    return None


def extract_and_parse_chat(file_content: str, filename: str):
    messages: list[ChatMessage] = []
    current_msg: ChatMessage | None = None

    for raw in file_content.splitlines():
        line = raw.strip()
        if not line:
            continue

        matched = False
        for pattern in WHATSAPP_PATTERNS:
            m = re.match(pattern, line)
            if m:
                date_str, time_str, sender, content = m.groups()
                dt = parse_datetime(date_str, time_str)
                current_msg = ChatMessage(dt, sender, content)
                messages.append(current_msg)
                matched = True
                break

        if not matched:
            if messages:
                messages[-1].content += "\n" + raw

    return messages


def filter_messages_by_date(messages, start_date, start_time, end_date, end_time):
    if not (start_date and end_date):
        return messages
    try:
        start_dt = datetime.strptime(
            f"{start_date} {start_time or '00:00'}", "%Y-%m-%d %H:%M"
        )
        end_dt = datetime.strptime(
            f"{end_date} {end_time or '23:59'}", "%Y-%m-%d %H:%M"
        )
    except ValueError:
        return messages

    filtered = [m for m in messages if m.is_in_range(start_dt, end_dt)]
    return filtered or messages


def messages_to_text(messages):
    return "\n".join(f"{m.sender}: {m.content}" for m in messages)


# ------------- Flask routes ------------- #

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/summarize", methods=["POST"])
def summarize_chat():
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "No file selected"}), 400

        start_date = request.form.get("startDate", "")
        start_time = request.form.get("startTime", "00:00")
        end_date = request.form.get("endDate", "")
        end_time = request.form.get("endTime", "23:59")

        # --- read chat content (zip or txt) ---
        if file.filename.endswith(".zip"):
            with tempfile.TemporaryDirectory() as tmpdir:
                zip_path = os.path.join(tmpdir, file.filename)
                file.save(zip_path)
                with zipfile.ZipFile(zip_path, "r") as z:
                    z.extractall(tmpdir)
                chat_content = ""
                for fname in os.listdir(tmpdir):
                    if fname.endswith(".txt"):
                        with open(
                            os.path.join(tmpdir, fname),
                            "r",
                            encoding="utf-8",
                            errors="ignore",
                        ) as f:
                            chat_content = f.read()
                            break
        else:
            chat_content = file.read().decode("utf-8", errors="ignore")

        if not chat_content.strip():
            return jsonify({"error": "No chat content found"}), 400

        # --- parse & filter messages ---
        messages = extract_and_parse_chat(chat_content, file.filename)

        if not messages:
            filtered_text = chat_content
            msg_count = 0
        else:
            if start_date and end_date:
                messages = filter_messages_by_date(
                    messages, start_date, start_time, end_date, end_time
                )
            filtered_text = messages_to_text(messages)
            msg_count = len(messages)

        # --- call Gemini with supported model ---
        model = genai.GenerativeModel(GEMINI_MODEL_NAME)
        prompt = f"""
You are a WhatsApp chat summarizer.

Summarize the following chat conversation clearly and concisely.
Focus on:
- Main topics and themes
- Key decisions or events
- Any recurring patterns or tone

Keep the summary in 3–5 short paragraphs.

Chat content:
{filtered_text}
"""
        try:
            response = model.generate_content(prompt)
            summary_text = getattr(response, "text", "").strip()
        except Exception as e:
            # If primary key fails, try fallback key
            if API_KEY_FALLBACK and "quota" in str(e).lower():
                try:
                    genai.configure(api_key=API_KEY_FALLBACK)
                    model = genai.GenerativeModel(GEMINI_MODEL_NAME)
                    response = model.generate_content(prompt)
                    summary_text = getattr(response, "text", "").strip()
                except Exception as fallback_error:
                    return jsonify({"error": f"Both API keys exhausted. Error: {str(fallback_error)}"}), 429
            else:
                return jsonify({"error": str(e)}), 500
        if not summary_text:
            return jsonify({"error": "Model returned empty response"}), 500

        return jsonify(
            {
                "success": True,
                "summary": summary_text,
                "messages_count": msg_count,
                "date_range": f"{start_date} to {end_date}"
                if start_date and end_date
                else "All dates",
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/guide", methods=["GET"])
def get_guide():
    guide = {
        "title": "How to Export Your WhatsApp Chat",
        "steps": [
            {
                "number": 1,
                "title": "Open WhatsApp",
                "description": "Launch WhatsApp on your device (Android, iPhone, or Web).",
            },
            {
                "number": 2,
                "title": "Select the Chat",
                "description": "Open the chat or group you want to export and summarize.",
            },
            {
                "number": 3,
                "title": "Open More Options",
                "description": "Tap the three dots (⋮) in the top-right corner.",
            },
            {
                "number": 4,
                "title": "Tap Export chat",
                "description": "Go to More → Export chat.",
            },
            {
                "number": 5,
                "title": "Choose Format",
                "description": "Select Without media (recommended) or With media. A .txt or .zip file will be generated.",
            },
            {
                "number": 6,
                "title": "Save or Share",
                "description": "Save the exported file to your device or send it to yourself.",
            },
            {
                "number": 7,
                "title": "Upload the File",
                "description": "Upload the exported .txt or .zip file on this website.",
            },
            {
                "number": 8,
                "title": "Set Date Range (Optional)",
                "description": "Optionally choose a From and To date/time to focus on a specific period.",
            },
        ],
    }
    return jsonify(guide)


if __name__ == "__main__":
    # Use debug=True only in development
    app.run(debug=True, host="0.0.0.0", port=5000)
