/**
 * CONFIGURATION
 */
const CONFIG = {
    maxChars: 50,
    baseRadius: 220,
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

// ==========================================
// AUDIO
// ==========================================
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

// ==========================================
// VISUAL
// ==========================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let width, height;
let particles = [];
let dust = []; 

//
const VISUAL_CONFIG = {
    ...CONFIG,
    wobbleSpeed: 0.002,  
    wobbleRange: 10,
    dustCount: 200, 
    dustRadius: 2.0 
};

//dust section
class Dust {
    constructor() {
        this.reset();

        this.angleOffset = Math.random() * Math.PI * 2;
    }
    reset() {
        // x,y
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        
        // range
        const r = VISUAL_CONFIG.baseRadius * (1.2 + Math.random() * VISUAL_CONFIG.dustRadius); 
        
        this.x = r * Math.sin(phi) * Math.cos(theta);
        this.y = r * Math.sin(phi) * Math.sin(theta);
        this.z = r * Math.cos(phi);
        
        this.size = Math.random() * 1.0 + 0.5;
        
        // blink
        this.blinkSpeed = 0.002 + Math.random() * 0.005; // speed
        this.blinkPhase = Math.random() * Math.PI * 2;   // phase
    }
    
    project(time, rotationSpeed) {
        let angleY = time * rotationSpeed * 0.3 + this.angleOffset; 
        
        // Floating
        let floatY = this.y + Math.sin(time * 0.001 + this.blinkPhase) * 20;

        // 3D rotation
        let x1 = this.x * Math.cos(angleY) - this.z * Math.sin(angleY);
        let z1 = this.x * Math.sin(angleY) + this.z * Math.cos(angleY);
        
        const scale = VISUAL_CONFIG.perspective / (VISUAL_CONFIG.perspective + z1 + 300);
        
        // Sine Wave
        const blink = 0.1 + (Math.sin(time * this.blinkSpeed + this.blinkPhase) + 1) / 2 * 0.5;

        return {
            x: width / 2 + x1 * scale,
            y: height / 2.2 + floatY * scale,
            scale: scale,
            alpha: blink * scale, 
            size: this.size
        };
    }
}

class Particle {
    constructor(char, index, total) {
        this.char = char;
        const y = 1 - (index / (total - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const theta = (Math.PI * (3 - Math.sqrt(5))) * index;
        
        this.ox = Math.cos(theta) * r; 
        this.oy = y; 
        this.oz = Math.sin(theta) * r;
        
        this.phase = Math.random() * Math.PI * 2; 
        this.pulse = 0; 
    }

    project(time) {
        const dynamics = STATE.dynamics / 100;
        const tempoSpeed = STATE.tempo / 100;
        const rotationSpeed = VISUAL_CONFIG.baseRotationSpeed + (tempoSpeed * 0.001);
        let angleY = time * rotationSpeed;
        
        const breathe = Math.sin(time * VISUAL_CONFIG.wobbleSpeed) * VISUAL_CONFIG.wobbleRange;
        const wave = Math.sin(time * 0.002 + this.oy * 6 + this.phase);
        
        const currentRadius = VISUAL_CONFIG.baseRadius + breathe + (wave * dynamics * 80);

        let x = this.ox * currentRadius; 
        let y = this.oy * currentRadius; 
        let z = this.oz * currentRadius;

        let x1 = x * Math.cos(angleY) - z * Math.sin(angleY);
        let z1 = x * Math.sin(angleY) + z * Math.cos(angleY);
        
        const scale = VISUAL_CONFIG.perspective / (VISUAL_CONFIG.perspective + z1 + 300);
        
        return { 
            x: width / 2 + x1 * scale, 
            y: (height / 2.2) + y * scale, 
            z: z1, 
            scale: scale, 
            alpha: scale 
        };
    }
}

function processText(text) {
    const len = Math.min(text.length, VISUAL_CONFIG.maxChars);
    const ratio = len / VISUAL_CONFIG.maxChars; 
    STATE.currentHue = VISUAL_CONFIG.hueStart - (ratio * (VISUAL_CONFIG.hueStart - VISUAL_CONFIG.hueEnd));
    
    particles = []; 
    let fullText = text;
    const target = Math.max(text.length * 3, 250); 
    while(fullText.length < target) fullText += " " + text;
    if(fullText.length > 500) fullText = fullText.substring(0, 500); 
    
    for(let i=0; i<fullText.length; i++) { 
        if(fullText[i] !== ' ') particles.push(new Particle(fullText[i], i, fullText.length)); 
    }
    
    dust = [];
    for(let i=0; i<VISUAL_CONFIG.dustCount; i++) dust.push(new Dust());
}

function animate(time) {
    ctx.clearRect(0, 0, width, height);

    const dynamicHue = STATE.currentHue + Math.sin(time * 0.0005) * 30;

    // Center Glow
    const glow = ctx.createRadialGradient(width/2, height/2.2, 0, width/2, height/2.2, VISUAL_CONFIG.baseRadius * 1.8);
    glow.addColorStop(0, `hsla(${dynamicHue}, 80%, 60%, 0.18)`); 
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    // prepare data
    const tempoSpeed = STATE.tempo / 100;
    const rotationSpeed = VISUAL_CONFIG.baseRotationSpeed + (tempoSpeed * 0.001);

    const projectedParticles = particles.map(p => { 
        p.pulse *= 0.94; 
        return { ...p.project(time), type: 'text', char: p.char, pulse: p.pulse }; 
    });

    const projectedDust = dust.map(d => {
        return { ...d.project(time, rotationSpeed), type: 'dust' };
    });

    const allElements = [...projectedParticles, ...projectedDust];
    allElements.sort((a, b) => a.scale - b.scale);

    // draw
    ctx.textAlign = 'center'; 
    ctx.textBaseline = 'middle';
    
    allElements.forEach(p => {
        if (p.type === 'dust') {
            // draw dust
            const alpha = Math.max(0, p.alpha);
            
            // dust color
            ctx.fillStyle = `hsla(${dynamicHue}, 30%, 90%, ${alpha})`;
            
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.scale, 0, Math.PI * 2);
            ctx.fill();
            
        } else {
            // draw text
            const alpha = Math.max(0.05, p.alpha - 0.1); 
            const size = (16 + p.pulse * 10) * p.scale; 
            
            ctx.font = `${size}px 'Space Grotesk', monospace`;
            
            const lightness = 65 + (STATE.dynamics/100 * 20) + (p.pulse * 35);
            const color = `hsla(${dynamicHue}, 90%, ${lightness}%, ${alpha})`;
            
            ctx.fillStyle = color;
            
            if(p.pulse > 0.1) { 
                ctx.shadowBlur = (15 * p.pulse) * p.scale; 
                ctx.shadowColor = color; 
            } else { 
                ctx.shadowBlur = 0; 
            }
            
            ctx.fillText(p.char, p.x, p.y); 
            ctx.shadowBlur = 0;
        }
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

window.addEventListener('resize', () => { 
    width = canvas.width = window.innerWidth; 
    height = canvas.height = window.innerHeight; 
});

// initial state
width = canvas.width = window.innerWidth; 
height = canvas.height = window.innerHeight;
processText(input.value); 
animate(0);