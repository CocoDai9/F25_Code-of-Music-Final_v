/**
 * CONFIGURATION
 */
const CONFIG = {
    maxChars: 50,
    baseRadius: 200,
    perspective: 850,
    baseRotationSpeed: 0.0003,
    hueStart: 210, 
    hueEnd: 350,
    connectionDist: 35
};

const STATE = {
    text: "Interstellar Silence",
    dynamics: 35,
    tempo: 45,
    currentHue: 210
};

/**
 * AUDIO ENGINE: Soft Grand Piano
 */
const AudioEngine = {
    ctx: null, isPlaying: false, timer: null, sequence: [], step: 0, masterGain: null,
    
    // Scale: C Minor Harmonic
    scale: [
        130.81, 146.83, 155.56, 174.61, 196.00, 207.65, 246.94,
        261.63, 293.66, 311.13, 349.23, 392.00, 415.30, 493.88,
        523.25, 587.33, 622.25
    ],

    init() {
        if (!this.ctx) { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.setupBus(); }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    setupBus() {
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.35; // Soft gain
        this.masterGain.connect(this.ctx.destination);

        const rate = this.ctx.sampleRate;
        const length = rate * 4.0; 
        const impulse = this.ctx.createBuffer(2, length, rate);
        const [L, R] = [impulse.getChannelData(0), impulse.getChannelData(1)];
        for (let i = 0; i < length; i++) {
            const decay = Math.pow(1 - i / length, 2.5);
            L[i] = (Math.random() * 2 - 1) * decay;
            R[i] = (Math.random() * 2 - 1) * decay;
        }
        this.reverb = this.ctx.createConvolver();
        this.reverb.buffer = impulse;
        
        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.value = 0.5; 
        this.reverb.connect(this.reverbGain);
        this.reverbGain.connect(this.masterGain);
    },

    playPianoNote(freq, time, velocity = 1.0) {
        const dynamicsLevel = STATE.dynamics / 100;
        const hitForce = Math.max(0.1, dynamicsLevel * velocity);

        // Strings
        const detunes = [0, 4, -4];
        const oscs = [];
        detunes.forEach(d => {
            const osc = this.ctx.createOscillator();
            osc.type = 'triangle'; osc.frequency.value = freq; osc.detune.value = d;
            oscs.push(osc);
        });

        // Filter
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        const cutoff = 150 + (hitForce * 2500); 
        filter.frequency.setValueAtTime(cutoff, time);
        filter.frequency.exponentialRampToValueAtTime(100, time + 2.5);

        // Envelope
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(hitForce, time + 0.03); 
        gain.gain.exponentialRampToValueAtTime(hitForce * 0.5, time + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 4.0);

        // Thud
        const atkOsc = this.ctx.createOscillator();
        const atkGain = this.ctx.createGain();
        atkOsc.type = 'sine'; atkOsc.frequency.value = 80;
        atkGain.gain.setValueAtTime(0, time);
        atkGain.gain.linearRampToValueAtTime(hitForce * 0.1, time + 0.01);
        atkGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
        atkOsc.connect(atkGain).connect(this.masterGain);
        atkOsc.start(time); atkOsc.stop(time + 0.1);

        oscs.forEach(osc => {
            osc.connect(filter); osc.start(time); osc.stop(time + 4.5);
        });
        filter.connect(gain); gain.connect(this.masterGain); gain.connect(this.reverb);
    },

    playChord(rootIndex) {
        const t = this.ctx.currentTime;
        const rootFreq = this.scale[rootIndex];
        
        this.playPianoNote(rootFreq, t, 0.9);
        const thirdIndex = (rootIndex + 2) % this.scale.length;
        this.playPianoNote(this.scale[thirdIndex], t + 0.03, 0.6);
        const fifthIndex = (rootIndex + 4) % this.scale.length;
        this.playPianoNote(this.scale[fifthIndex], t + 0.05, 0.65);
        
        if (Math.random() > 0.75) this.playPianoNote(rootFreq * 2, t + 0.06, 0.3);
    },

    start(text) {
        this.init(); this.isPlaying = true; this.sequence = [];
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            const index = code % this.scale.length;
            this.sequence.push({ index: index, charIndex: i });
        }
        clearTimeout(this.timer); this.step = 0;

        const loop = () => {
            if (!this.isPlaying) return;
            const noteData = this.sequence[this.step];
            
            this.playChord(noteData.index);
            if(particles[noteData.charIndex]) particles[noteData.charIndex].pulse = 1.0;

            this.step = (this.step + 1) % this.sequence.length;
            
            const tempoVal = STATE.tempo;
            const delay = 2200 - (tempoVal * 20); 
            this.timer = setTimeout(loop, Math.max(200, delay));
        };
        loop();
    },

    stop() { this.isPlaying = false; clearTimeout(this.timer); }
};

// --- VISUAL ENGINE ---
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let width, height, particles = [];

class Particle {
    constructor(char, index, total) {
        this.char = char;
        const y = 1 - (index / (total - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const theta = (Math.PI * (3 - Math.sqrt(5))) * index;
        this.ox = Math.cos(theta) * r; this.oy = y; this.oz = Math.sin(theta) * r;
        this.phase = Math.random() * Math.PI * 2; this.pulse = 0; 
    }
    project(time) {
        const dynamics = STATE.dynamics / 100;
        const wave = Math.sin(time * 0.002 + this.oy * 6 + this.phase);
        const currentRadius = CONFIG.baseRadius + (wave * dynamics * 80);

        const tempoSpeed = STATE.tempo / 100;
        const rotationSpeed = CONFIG.baseRotationSpeed + (tempoSpeed * 0.001);
        let angleY = time * rotationSpeed;
        
        let x = this.ox * currentRadius; let y = this.oy * currentRadius; let z = this.oz * currentRadius;
        let x1 = x * Math.cos(angleY) - z * Math.sin(angleY);
        let z1 = x * Math.sin(angleY) + z * Math.cos(angleY);
        const scale = CONFIG.perspective / (CONFIG.perspective + z1 + 300);
        
        return { 
            x: width / 2 + x1 * scale, 
            y: (height / 2.2) + y * scale, 
            z: z1, scale: scale, alpha: scale 
        };
    }
}

function processText(text) {
    const len = Math.min(text.length, CONFIG.maxChars);
    const ratio = len / CONFIG.maxChars; 
    STATE.currentHue = CONFIG.hueStart - (ratio * (CONFIG.hueStart - CONFIG.hueEnd));
    particles = []; let fullText = text;
    const target = Math.max(text.length * 3, 120);
    while(fullText.length < target) fullText += " " + text;
    if(fullText.length > 300) fullText = fullText.substring(0, 300);
    for(let i=0; i<fullText.length; i++) { if(fullText[i] !== ' ') particles.push(new Particle(fullText[i], i, fullText.length)); }
}

function animate(time) {
    ctx.clearRect(0, 0, width, height);
    const projected = particles.map(p => { p.pulse *= 0.93; return { ...p.project(time), char: p.char, pulse: p.pulse }; });
    projected.sort((a, b) => a.scale - b.scale);

    ctx.lineWidth = 0.5;
    for(let i=0; i<projected.length; i++) {
        const p1 = projected[i]; if(p1.scale < 0.8) continue;
        for(let j=i+1; j<Math.min(i+10, projected.length); j++) {
            const p2 = projected[j];
            const dx = p1.x - p2.x; const dy = p1.y - p2.y; const dist = Math.sqrt(dx*dx + dy*dy);
            if(dist < CONFIG.connectionDist * p1.scale) {
                const alpha = (1 - dist / (CONFIG.connectionDist * p1.scale)) * 0.15;
                ctx.strokeStyle = `hsla(${STATE.currentHue}, 50%, 80%, ${alpha})`;
                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
            }
        }
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    projected.forEach(p => {
        const alpha = Math.max(0.05, p.alpha - 0.2);
        const size = (14 + p.pulse * 7) * p.scale; 
        ctx.font = `${size}px 'Space Grotesk'`;
        const lightness = 70 + (STATE.dynamics/100 * 15) + (p.pulse * 25);
        const color = `hsla(${STATE.currentHue}, 90%, ${lightness}%, ${alpha})`;
        ctx.fillStyle = color;
        if(p.pulse > 0.05) { ctx.shadowBlur = 25 * p.scale; ctx.shadowColor = color; } 
        else { ctx.shadowBlur = 0; }
        ctx.fillText(p.char, p.x, p.y); ctx.shadowBlur = 0;
    });
    requestAnimationFrame(animate);
}

// UI Setup
const input = document.getElementById('userText');
const btn = document.getElementById('generateBtn');
const dynamicsSlider = document.getElementById('dynamicsSlider');
const tempoSlider = document.getElementById('tempoSlider');
const count = document.getElementById('charCount');

input.addEventListener('input', () => count.innerText = `${input.value.length} / ${CONFIG.maxChars}`);
dynamicsSlider.addEventListener('input', (e) => STATE.dynamics = parseInt(e.target.value));
tempoSlider.addEventListener('input', (e) => STATE.tempo = parseInt(e.target.value));

btn.addEventListener('click', () => {
    const text = input.value || "Piano";
    const span = btn.querySelector('.btn-content');
    span.innerText = "TUNING..."; btn.style.opacity = 0.7;
    setTimeout(() => {
        span.innerText = "INITIALIZE"; btn.style.opacity = 1;
        processText(text); if(AudioEngine.isPlaying) AudioEngine.stop(); AudioEngine.start(text);
    }, 400);
});
window.addEventListener('resize', () => { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; });
width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight;
processText(input.value); animate(0);