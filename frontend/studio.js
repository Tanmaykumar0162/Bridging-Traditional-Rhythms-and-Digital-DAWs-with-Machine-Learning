const audioUpload = document.getElementById("audioUpload");
const inputAudioPlayer = document.getElementById("inputAudioPlayer");
const uploadStatus = document.getElementById("uploadStatus");
const processBtn = document.getElementById("processBtn");
const recordBtn = document.getElementById("recordBtn");
const stopRecordBtn = document.getElementById("stopRecordBtn");
const recordingIndicator = document.getElementById("recordingIndicator");
const recTimer = document.getElementById("recTimer");
const progressSection = document.getElementById("progressSection");
const progressBar = document.getElementById("progressBar");
const progressPct = document.getElementById("progressPct");
const dropZone = document.getElementById("dropZone");
const targetMeter = document.getElementById("targetMeter");
const strictnessSlider = document.getElementById("strictnessSlider");
const strictnessVal = document.getElementById("strictnessVal");
const editorEmpty = document.getElementById("editorEmpty");

const metaBar = document.getElementById("meta-bar");
const metaBPM = document.getElementById("metaBPM");
const metaLaya = document.getElementById("metaLaya");
const metaStrokes = document.getElementById("metaStrokes");
const metaDuration = document.getElementById("metaDuration");
const metaTaal = document.getElementById("metaTaal");

const indianCard = document.getElementById("indian-card");
const bolGrid = document.getElementById("bolGrid");
const taalInfo = document.getElementById("taalInfo");

const notationCard = document.getElementById("notation-card");
const grooveCard = document.getElementById("groove-card");
const visualizerCard = document.getElementById("visualizer-card");
const notesCanvas = document.getElementById("notes-canvas");
const midiSection = document.getElementById("midi-section");
const drumPlayer = document.getElementById("drumPlayer");
const downloadBtn = document.getElementById("downloadBtn");
const saveProjectBtn = document.getElementById("saveProjectBtn");

const transportPlayBtn = document.getElementById("transportPlayBtn");
const transportPauseBtn = document.getElementById("transportPauseBtn");
const transportMidiBtn = document.getElementById("transportMidiBtn");
const transportGrooveBtn = document.getElementById("transportGrooveBtn");
const transportStatus = document.getElementById("transportStatus");
const transportBPM = document.getElementById("transportBPM");
const transportMeter = document.getElementById("transportMeter");
const transportHumanize = document.getElementById("transportHumanize");

const SOURCE_ROLE_TEXT = {
    Dha: "Bass accent",
    Dhin: "Kick anchor",
    Ghe: "Low-end motion",
    Na: "Backbeat",
    Ta: "Backbeat",
    Tun: "Tom fill",
    Tin: "Ride accent",
    Ti: "Top groove",
    Re: "Pedal pulse",
    Ki: "Rim accent",
    T: "Hat pulse",
    Kat: "Rim accent",
};

let sessionData = {};
let mediaRecorder = null;
let recordedChunks = [];
let recInterval = null;
let recSeconds = 0;
let inputPreviewUrl = "";

function setTransportState(label) {
    transportStatus.textContent = label;
}

function setActionLinkEnabled(link, enabled) {
    if (!link) {
        return;
    }

    link.classList.toggle("disabled", !enabled);
    link.setAttribute("aria-disabled", String(!enabled));
}

function setPlaybackEnabled(enabled) {
    transportPlayBtn.disabled = !enabled;
    transportPauseBtn.disabled = !enabled;
    setActionLinkEnabled(transportMidiBtn, enabled);
    setActionLinkEnabled(transportGrooveBtn, enabled);
    saveProjectBtn.disabled = !enabled;
}

function resetStudioPanels() {
    progressSection.classList.add("hidden");
    metaBar.classList.add("hidden");
    indianCard.classList.add("hidden");
    notationCard.classList.add("hidden");
    grooveCard.classList.add("hidden");
    visualizerCard.classList.add("hidden");
    midiSection.classList.add("hidden");
    bolGrid.innerHTML = "";
    notesCanvas.innerHTML = "";
    taalInfo.classList.add("hidden");
    taalInfo.innerHTML = "";
    metaBPM.textContent = "-";
    metaLaya.textContent = "-";
    metaStrokes.textContent = "-";
    metaDuration.textContent = "-";
    metaTaal.textContent = "-";
    document.getElementById("vizAvgDev").textContent = "-";
    document.getElementById("vizMaxDev").textContent = "-";
    document.getElementById("vizHumanize").textContent = "-";
    document.getElementById("vizOnsets").textContent = "-";
    saveProjectBtn.textContent = "Save Session";
    drumPlayer.removeAttribute("src");
    drumPlayer.src = "";
}

function updateTransportReadouts({ bpm = "--.-", meter = "--", humanize = "--" } = {}) {
    transportBPM.textContent = bpm;
    transportMeter.textContent = meter;
    transportHumanize.textContent = humanize;
}

function handleFileSelected(file) {
    if (inputPreviewUrl) {
        URL.revokeObjectURL(inputPreviewUrl);
    }

    inputPreviewUrl = URL.createObjectURL(file);
    inputAudioPlayer.src = inputPreviewUrl;
    inputAudioPlayer.classList.remove("hidden");
    uploadStatus.textContent = "Loaded";
    uploadStatus.classList.remove("hidden");
    sessionData = {};
    resetStudioPanels();
    editorEmpty.classList.remove("hidden");
    setPlaybackEnabled(false);
    updateTransportReadouts();
    processBtn.disabled = false;
    setTransportState("Armed");
}

function tryMidiTransport(action) {
    if (!drumPlayer || !drumPlayer.src) {
        return false;
    }

    try {
        const methodCandidates =
            action === "play"
                ? ["play", "start"]
                : ["pause", "stop"];

        for (const method of methodCandidates) {
            if (typeof drumPlayer[method] === "function") {
                drumPlayer[method]();
                return true;
            }
        }

        const shadowButtons = drumPlayer.shadowRoot?.querySelectorAll("button") || [];
        if (shadowButtons.length > 0) {
            if (action === "play") {
                shadowButtons[0].click();
                return true;
            }

            if (shadowButtons.length > 1) {
                shadowButtons[1].click();
                return true;
            }

            shadowButtons[0].click();
            return true;
        }
    } catch (error) {
        console.warn("Transport action failed", error);
    }

    return false;
}

strictnessSlider.addEventListener("input", () => {
    strictnessVal.textContent = Number(strictnessSlider.value).toFixed(2);
});

setPlaybackEnabled(false);
strictnessVal.textContent = Number(strictnessSlider.value).toFixed(2);

[transportMidiBtn, transportGrooveBtn].forEach((link) => {
    link.addEventListener("click", (event) => {
        if (link.classList.contains("disabled")) {
            event.preventDefault();
        }
    });
});

transportPlayBtn.addEventListener("click", () => {
    if (tryMidiTransport("play")) {
        setTransportState("Playing");
    }
});

transportPauseBtn.addEventListener("click", () => {
    if (tryMidiTransport("pause")) {
        setTransportState("Paused");
    }
});

["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.add("dragover");
    });
});

["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.remove("dragover");
    });
});

dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (file) {
        audioUpload.files = event.dataTransfer.files;
        handleFileSelected(file);
    }
});

audioUpload.addEventListener("change", function () {
    if (this.files[0]) {
        handleFileSelected(this.files[0]);
    }
});

recordBtn.addEventListener("click", async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const preferredMimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : MediaRecorder.isTypeSupported("audio/webm")
                ? "audio/webm"
                : "";
        mediaRecorder = preferredMimeType
            ? new MediaRecorder(stream, { mimeType: preferredMimeType })
            : new MediaRecorder(stream);
        recordedChunks = [];
        recSeconds = 0;

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            stream.getTracks().forEach((track) => track.stop());
            clearInterval(recInterval);
            recordingIndicator.classList.add("hidden");
            recordBtn.classList.remove("hidden");

            const blob = new Blob(recordedChunks, { type: "audio/webm" });
            const file = new File([blob], "live_recording.webm", { type: "audio/webm" });
            const transfer = new DataTransfer();
            transfer.items.add(file);
            audioUpload.files = transfer.files;
            handleFileSelected(file);
            setTransportState("Armed");
        };

        mediaRecorder.start();
        recordBtn.classList.add("hidden");
        recordingIndicator.classList.remove("hidden");
        setTransportState("Recording");
        recInterval = setInterval(() => {
            recSeconds += 1;
            const minutes = String(Math.floor(recSeconds / 60)).padStart(2, "0");
            const seconds = String(recSeconds % 60).padStart(2, "0");
            recTimer.textContent = `${minutes}:${seconds}`;
        }, 1000);
    } catch (error) {
        alert("Microphone access is required to record audio.");
    }
});

stopRecordBtn.addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }
});

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; 
    const bitDepth = 16;

    let result;
    if (numChannels === 2) {
        const interleaved = new Float32Array(buffer.length * 2);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        for (let i = 0; i < buffer.length; i++) {
            interleaved[i * 2] = left[i];
            interleaved[i * 2 + 1] = right[i];
        }
        result = interleaved;
    } else {
        result = buffer.getChannelData(0);
    }

    const dataLength = result.length * (bitDepth / 8);
    const bufferData = new ArrayBuffer(44 + dataLength);
    const view = new DataView(bufferData);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < result.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, result[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return bufferData;
}

processBtn.addEventListener("click", async () => {
    const file = audioUpload.files[0];
    if (!file) {
        alert("Please upload or record audio first.");
        return;
    }

    processBtn.disabled = true;
    resetStudioPanels();
    sessionData = {};
    editorEmpty.classList.add("hidden");
    progressSection.classList.remove("hidden");
    progressBar.style.width = "0%";
    progressPct.textContent = "0%";
    setPlaybackEnabled(false);
    updateTransportReadouts();
    setTransportState("Converting...");
    
    let processedFile = file;
    try {
        const arrayBuffer = await file.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const wavData = audioBufferToWav(audioBuffer);
        const wavBlob = new Blob([wavData], { type: "audio/wav" });
        processedFile = new File([wavBlob], "converted_audio.wav", { type: "audio/wav" });
        if (audioCtx.state !== 'closed') {
            audioCtx.close();
        }
    } catch (e) {
        console.warn("Failed to convert audio internally, falling back to original file.", e);
    }

    setTransportState("Analyzing");

    const formData = new FormData();
    formData.append("file", processedFile);
    formData.append("target_meter", targetMeter.value);
    formData.append("strictness", strictnessSlider.value);

    let drumArrangementReady = false;

    try {
        const response = await fetch("/stream_transcript", {
            method: "POST",
            body: formData,
        });

        if (!response.ok || !response.body) {
            let errorMessage = `Processing failed with status ${response.status}`;
            try {
                const errorPayload = await response.json();
                if (errorPayload?.error) {
                    errorMessage = errorPayload.error;
                }
            } catch (parseError) {
                console.warn("Could not parse processing error payload", parseError);
            }
            throw new Error(errorMessage);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const messages = buffer.split("\n\n");
            buffer = messages.pop() || "";

            for (const message of messages) {
                if (!message.startsWith("data: ")) {
                    continue;
                }

                const payload = message.replace("data: ", "");

                if (payload === "DONE") {
                    if (drumArrangementReady) {
                        notationCard.classList.remove("hidden");
                    }

                    grooveCard.classList.remove("hidden");
                    const midiSrc = `/static/AI_Drum_Output.mid?t=${Date.now()}`;
                    drumPlayer.setAttribute("src", midiSrc);
                    drumPlayer.src = midiSrc;
                    midiSection.classList.remove("hidden");
                    progressSection.classList.add("hidden");
                    processBtn.disabled = false;
                    setPlaybackEnabled(true);
                    setTransportState("Ready");
                    continue;
                }

                if (payload.startsWith("META|")) {
                    const meta = JSON.parse(payload.slice(5));
                    metaBPM.textContent = `${meta.bpm} BPM`;
                    metaLaya.textContent = meta.laya;
                    metaStrokes.textContent = meta.total_strokes;
                    metaDuration.textContent = `${meta.duration}s`;
                    metaBar.classList.remove("hidden");
                    sessionData.bpm = meta.bpm;
                    sessionData.laya = meta.laya;
                    sessionData.total_strokes = meta.total_strokes;
                    sessionData.duration_sec = meta.duration;
                    updateTransportReadouts({ bpm: meta.bpm, meter: transportMeter.textContent, humanize: transportHumanize.textContent });
                    continue;
                }

                if (payload.startsWith("TAAL|")) {
                    const taal = JSON.parse(payload.slice(5));
                    metaTaal.textContent = taal.name + (taal.confidence ? ` (${taal.confidence}%)` : "");
                    const description = taal.details && taal.details.description ? taal.details.description : "";
                    const display = taal.details && taal.details.display ? taal.details.display : "";
                    taalInfo.innerHTML =
                        `<strong>${taal.name}</strong> - ${description}` +
                        (display ? `<br><span class="taal-theka">Theka: ${display}</span>` : "");
                    taalInfo.classList.remove("hidden");
                    indianCard.classList.remove("hidden");
                    sessionData.detected_taal = taal.name;
                    continue;
                }

                if (payload.startsWith("GROOVE|")) {
                    const groove = JSON.parse(payload.slice(7));
                    const grooveText = `<strong>${groove.meter} drum grid</strong> - ${groove.summary}`;
                    if (taalInfo.classList.contains("hidden")) {
                        taalInfo.innerHTML = grooveText;
                        taalInfo.classList.remove("hidden");
                    } else {
                        taalInfo.innerHTML += `<br><span class="groove-summary">${grooveText}</span>`;
                    }
                    sessionData.meter = groove.meter;
                    updateTransportReadouts({ bpm: transportBPM.textContent, meter: groove.meter, humanize: transportHumanize.textContent });
                    continue;
                }

                if (payload.startsWith("GROOVE_PROFILE|")) {
                    const profile = JSON.parse(payload.slice(15));
                    sessionData.groove_profile = profile;
                    sessionData.avg_deviation_ms = profile.stats.avg_deviation_ms;
                    sessionData.max_deviation_ms = profile.stats.max_deviation_ms;
                    sessionData.humanize_score = profile.stats.humanize_score;
                    visualizerCard.classList.remove("hidden");
                    requestAnimationFrame(() => renderGrooveVisualizer(profile));
                    updateTransportReadouts({
                        bpm: transportBPM.textContent,
                        meter: transportMeter.textContent,
                        humanize: `${profile.stats.humanize_score}%`,
                    });
                    continue;
                }

                if (payload.startsWith("SEQUENCE|")) {
                    const sequence = JSON.parse(payload.slice(9));
                    renderBolGrid(sequence.bols, sequence.confidences);
                    indianCard.classList.remove("hidden");
                    continue;
                }

                if (payload.startsWith("DRUM_SEQUENCE|")) {
                    const arrangement = JSON.parse(payload.slice(14));
                    renderDrumArrangement(arrangement.steps || []);
                    drumArrangementReady = true;
                    notationCard.classList.remove("hidden");
                    continue;
                }

                if (payload.startsWith("PROGRESS|")) {
                    const pct = payload.split("|")[1];
                    progressBar.style.width = `${pct}%`;
                    progressPct.textContent = `${pct}%`;
                    setTransportState(`Processing ${pct}%`);
                }
            }
        }
    } catch (error) {
        console.error(error);
        progressSection.classList.add("hidden");
        processBtn.disabled = false;
        editorEmpty.classList.remove("hidden");
        setTransportState("Error");
        alert(error.message || "Error processing file. Make sure the backend server is running.");
    }
});

function renderBolGrid(bols, confidences) {
    bolGrid.innerHTML = "";

    bols.forEach((bol, index) => {
        if (index > 0 && index % 4 === 0) {
            const separator = document.createElement("div");
            separator.className = "bol-separator";
            bolGrid.appendChild(separator);
        }

        const confidence = confidences[index] || 0;
        const pct = Math.round(confidence * 100);
        let confidenceClass = "conf-high";
        if (pct < 70) {
            confidenceClass = "conf-low";
        } else if (pct < 90) {
            confidenceClass = "conf-med";
        }

        const cell = document.createElement("div");
        cell.className = `bol-cell ${confidenceClass}`;
        cell.innerHTML = `
            <span class="bol-name">${bol}</span>
            <span class="bol-conf">${pct}%</span>
            <span class="bol-drum">${SOURCE_ROLE_TEXT[bol] || "Groove signal"}</span>
        `;
        bolGrid.appendChild(cell);
    });
}

function renderDrumArrangement(steps) {
    let html = "";

    steps.forEach((step, index) => {
        if (step.is_bar_start && index > 0) {
            html += `<div class="bar-divider"></div>`;
        }

        html += `<div class="note-col generated-col">`;
        (step.notes || []).forEach((note) => {
            const stemTop = note.top - 35;
            html += `<div class="note-stem" style="top:${stemTop}px;"></div>`;
            html += `<div class="note-head ${note.type}" style="top:${note.top}px;">${note.text || ""}</div>`;
            if (note.label) {
                html += `<div class="note-label">${note.label}</div>`;
            }
        });
        html += `<div class="bol-label-note">${step.position}</div>`;
        if (step.source_hint) {
            html += `<div class="source-hint">${step.source_hint}</div>`;
        }
        html += `</div>`;
    });

    notesCanvas.innerHTML = html;
}

function renderGrooveVisualizer(profile) {
    const stats = profile.stats;
    document.getElementById("vizAvgDev").textContent = `${stats.avg_deviation_ms}ms`;
    document.getElementById("vizMaxDev").textContent = `${stats.max_deviation_ms}ms`;
    document.getElementById("vizHumanize").textContent = `${stats.humanize_score}%`;
    document.getElementById("vizOnsets").textContent = stats.total_onsets;

    const canvas = document.getElementById("grooveCanvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return;
    }

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 900;
    const height = 260;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const points = profile.points;
    const padLeft = 50;
    const padRight = 20;
    const padTop = 28;
    const padBottom = 40;
    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;
    const centerY = padTop + plotHeight / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#17191d";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
    ctx.fillRect(padLeft, padTop, plotWidth, plotHeight);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1.0;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, centerY);
    ctx.lineTo(width - padRight, centerY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(200, 200, 200, 0.6)";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Early", padLeft - 6, padTop + 16);
    ctx.fillStyle = "rgba(150, 150, 150, 0.6)";
    ctx.fillText("Late", padLeft - 6, height - padBottom - 6);

    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillText("Grid", padLeft - 6, centerY + 4);

    if (points.length === 0) {
        return;
    }

    const maxDev = Math.max(stats.max_deviation_ms, 10);
    const scale = (plotHeight / 2) / maxDev;
    const barWidth = Math.max(2, Math.min(12, plotWidth / points.length - 2));

    points.forEach((point, index) => {
        const x = padLeft + (index / Math.max(points.length - 1, 1)) * plotWidth;
        const devPx = point.deviation_ms * scale;
        const barTop = point.deviation_ms < 0 ? centerY + devPx : centerY;
        const barHeight = Math.abs(devPx);

        ctx.fillStyle = point.deviation_ms < 0 ? "rgba(180, 180, 180, 0.8)" : "rgba(100, 100, 100, 0.8)";
        ctx.fillRect(x - barWidth / 2, barTop, barWidth, Math.max(barHeight, 1));

        ctx.fillStyle = "rgba(255, 255, 255, 0.44)";
        ctx.font = '9px "Fira Code", monospace';
        ctx.textAlign = "center";
        if (points.length <= 60 || index % 2 === 0) {
            ctx.save();
            ctx.translate(x, height - padBottom + 12);
            ctx.rotate(-Math.PI / 4);
            ctx.fillText(point.bol, 0, 0);
            ctx.restore();
        }
    });

    ctx.fillStyle = "rgba(255, 255, 255, 0.34)";
    ctx.font = '10px "Fira Code", monospace';
    ctx.textAlign = "right";

    const tickValues = [-maxDev, -maxDev / 2, 0, maxDev / 2, maxDev];
    tickValues.forEach((value) => {
        const y = centerY - value * scale;
        ctx.fillText(`${Math.round(value)}ms`, padLeft - 6, y + 3);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(width - padRight, y);
        ctx.stroke();
    });
}

saveProjectBtn.addEventListener("click", async () => {
    const payload = {
        name: "Untitled Dhun",
        bpm: sessionData.bpm,
        laya: sessionData.laya,
        detected_taal: sessionData.detected_taal,
        total_strokes: sessionData.total_strokes,
        duration_sec: sessionData.duration_sec,
        avg_deviation_ms: sessionData.avg_deviation_ms,
        max_deviation_ms: sessionData.max_deviation_ms,
        humanize_score: sessionData.humanize_score,
        meter: sessionData.meter,
        midi_path: "static/AI_Drum_Output.mid",
        groove_path: "static/Tabla_Groove_Template.mid",
        groove_profile_json: JSON.stringify(sessionData.groove_profile || {}),
    };

    try {
        const res = await fetch("/api/save-project", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.status === "saved") {
            saveProjectBtn.textContent = "Saved";
            saveProjectBtn.disabled = true;
            setTimeout(() => {
                saveProjectBtn.textContent = "Save Session";
                saveProjectBtn.disabled = false;
            }, 3000);
        } else if (data.error === "Not authenticated") {
            if (confirm("You need to log in first. Open the login page in a new window?")) {
                window.open("/login", "_blank", "noopener,noreferrer,width=1320,height=900");
            }
        }
    } catch (error) {
        alert("Failed to save. Is the server running?");
    }
});

downloadBtn.addEventListener("click", () => {
    const captureArea = document.getElementById("capture-area");
    const scrollContainer = document.getElementById("scroll-container");
    const originalScroll = scrollContainer.scrollLeft;
    scrollContainer.scrollLeft = 0;

    html2canvas(captureArea, { scale: 2, backgroundColor: "#ffffff" }).then((canvas) => {
        const link = document.createElement("a");
        link.download = "TablatoDrum_Drum_Arrangement.png";
        link.href = canvas.toDataURL("image/png");
        link.click();
        scrollContainer.scrollLeft = originalScroll;
    });
});
