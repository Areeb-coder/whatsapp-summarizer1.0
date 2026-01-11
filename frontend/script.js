/* ===== DOM ELEMENTS ===== */
const chatFile = document.getElementById('chatFile');
const fileName = document.getElementById('fileName');
const summarizeBtn = document.getElementById('summarizeBtn');
const loadingSpinner = document.getElementById('loadingSpinner');
const resultCard = document.getElementById('resultCard');
const errorCard = document.getElementById('errorCard');
const placeholderCard = document.getElementById('placeholderCard');
const summaryContent = document.getElementById('summaryContent');
const copyBtn = document.getElementById('copyBtn');
const startDate = document.getElementById('startDate');
const endDate = document.getElementById('endDate');
const startTime = document.getElementById('startTime');
const endTime = document.getElementById('endTime');
const clearDatesBtn = document.getElementById('clearDates');
const msgCount = document.getElementById('msgCount');
const dateRange = document.getElementById('dateRange');
const guideSteps = document.getElementById('guideSteps');

/* ===== HAMBURGER MENU ===== */
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMenu.classList.toggle('active');
});

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        hamburger?.classList.remove('active');
        navMenu?.classList.remove('active');
    });
});

/* ===== SCROLL FUNCTION ===== */
function scrollToSection(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/* ===== FILE INPUT ===== */
chatFile?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        fileName.textContent = `✓ ${file.name}`;
        fileName.classList.add('success');
    } else {
        fileName.textContent = 'No file chosen';
        fileName.classList.remove('success');
    }
});

/* ===== CLEAR DATES ===== */
clearDatesBtn?.addEventListener('click', () => {
    startDate.value = '';
    endDate.value = '';
    startTime.value = '00:00';
    endTime.value = '23:59';
});

/* ===== SUMMARIZE FUNCTION ===== */
summarizeBtn?.addEventListener('click', async () => {
    if (!chatFile.files[0]) {
        showError('Please select a file first');
        return;
    }

    const file = chatFile.files[0];
    const formData = new FormData();
    formData.append('file', file);

    if (startDate.value) formData.append('startDate', startDate.value);
    if (startTime.value) formData.append('startTime', startTime.value);
    if (endDate.value) formData.append('endDate', endDate.value);
    if (endTime.value) formData.append('endTime', endTime.value);

    loadingSpinner.style.display = 'block';
    resultCard.style.display = 'none';
    errorCard.style.display = 'none';
    placeholderCard.style.display = 'none';

    try {
        const response = await fetch('/api/summarize', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            showError(data.error || 'An error occurred');
            return;
        }

        displayResult(data);
    } catch (error) {
        showError('Network error: ' + error.message);
    }
});

/* ===== DISPLAY RESULT ===== */
function displayResult(data) {
    loadingSpinner.style.display = 'none';
    errorCard.style.display = 'none';
    placeholderCard.style.display = 'none';
    resultCard.style.display = 'block';

    const paragraphs = data.summary.split('\n').filter(p => p.trim());
    const formattedSummary = paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
    summaryContent.innerHTML = formattedSummary;

    msgCount.textContent = data.messages_count || (data.summary ? '~' : 0);
    dateRange.textContent = data.date_range || 'All dates';
}

/* ===== SHOW ERROR ===== */
function showError(message) {
    loadingSpinner.style.display = 'none';
    resultCard.style.display = 'none';
    placeholderCard.style.display = 'none';
    errorCard.style.display = 'block';
    document.getElementById('errorMessage').textContent = message;
}

/* ===== COPY FUNCTIONALITY ===== */
copyBtn?.addEventListener('click', async () => {
    const text = summaryContent.innerText;
    try {
        await navigator.clipboard.writeText(text);
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
        }, 2000);
    } catch (err) {
        alert('Failed to copy: ' + err);
    }
});

/* ===== LOAD GUIDE ===== */
async function loadGuide() {
    try {
        const response = await fetch('/api/guide');
        const data = await response.json();

        const stepsHTML = data.steps
            .map(step => `
                <div class="step-card">
                    <div class="step-number">${step.number}</div>
                    <h3>${step.title}</h3>
                    <p>${step.description}</p>
                </div>
            `)
            .join('');

        guideSteps.innerHTML = stepsHTML;
    } catch (error) {
        console.error('Error loading guide:', error);
        guideSteps.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #b0b9c1;">Failed to load guide</p>';
    }
}

/* ===== DATE INPUT VALIDATION ===== */
startDate?.addEventListener('change', () => {
    if (endDate.value && new Date(startDate.value) > new Date(endDate.value)) {
        endDate.value = startDate.value;
    }
});

endDate?.addEventListener('change', () => {
    if (startDate.value && new Date(endDate.value) < new Date(startDate.value)) {
        startDate.value = endDate.value;
    }
});

/* ===== INITIALIZE ===== */
document.addEventListener('DOMContentLoaded', () => {
    loadGuide();
});

/* ===== KEYBOARD SHORTCUTS ===== */
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (chatFile.files[0]) {
            summarizeBtn.click();
        }
    }
});

/* ===== DRAG AND DROP ===== */
const fileLabel = document.querySelector('.file-label');

if (fileLabel) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        fileLabel.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        fileLabel.addEventListener(eventName, () => {
            fileLabel.classList.add('drag-over');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        fileLabel.addEventListener(eventName, () => {
            fileLabel.classList.remove('drag-over');
        }, false);
    });

    fileLabel.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        chatFile.files = files;
        chatFile.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

/* ===== SMOOTH SCROLL FOR ANCHOR LINKS ===== */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href && href !== '#' && href !== '#!') {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    });
});

/* ===== PARTICLES BACKGROUND (Canvas) ===== */
(function () {
    const canvas = document.getElementById('particlesCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];
    const NUM_PARTICLES = 80;
    const MAX_DISTANCE = 140;

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function createParticles() {
        particles = [];
        for (let i = 0; i < NUM_PARTICLES; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.6,
                vy: (Math.random() - 0.5) * 0.6,
                radius: 1.5 + Math.random() * 2,
                opacity: 0.2 + Math.random() * 0.6,
                color: Math.random() > 0.5 ? '#00d4ff' : '#7b2cbf'
            });
        }
    }

    function drawParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (const p of particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            const rgb = p.color === '#00d4ff' ? '0,212,255' : '123,44,191';
            ctx.fillStyle = `rgba(${rgb},${p.opacity})`;
            ctx.fill();
        }

        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const a = particles[i];
                const b = particles[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < MAX_DISTANCE) {
                    const alpha = 1 - dist / MAX_DISTANCE;
                    ctx.strokeStyle = `rgba(0, 212, 255, ${alpha * 0.25})`;
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }
    }

    function updateParticles() {
        for (const p of particles) {
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
            if (p.y < 0) p.y = canvas.height;
            if (p.y > canvas.height) p.y = 0;
        }
    }

    function animate() {
        updateParticles();
        drawParticles();
        requestAnimationFrame(animate);
    }

    createParticles();
    animate();
})();
