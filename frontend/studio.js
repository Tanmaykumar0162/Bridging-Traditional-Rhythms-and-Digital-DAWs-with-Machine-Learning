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
    Kat: "Rim accent"
};

// Store session data for save-to-library
let sessionData = {};

strictnessSlider.addEventListener("input", () => {
    strictnessVal.textContent = Number(strictnessSlider.value).toFixed(2);
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

function handleFileSelected(file) {
    inputAudioPlayer.src = URL.createObjectURL(file);
    inputAudioPlayer.classList.remove("hidden");
    uploadStatus.classList.remove("hidden");
    processBtn.disabled = false;
}

let mediaRecorder = null;
let recordedChunks = [];
let recInterval = null;
let recSeconds = 0;

recordBtn.addEventListener("click", async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
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
        };

        mediaRecorder.start();
        recordBtn.classList.add("hidden");
        recordingIndicator.classList.remove("hidden");
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

processBtn.addEventListener("click", async () => {
    const file = audioUpload.files[0];
    if (!file) {
        alert("Please upload or record audio first.");
        return;
    }

    processBtn.disabled = true;
    progressSection.classList.remove("hidden");
    progressBar.style.width = "0%";
    progressPct.textContent = "0%";
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
    sessionData = {};

    const formData = new FormData();
    formData.append("file", file);
    formData.append("target_meter", targetMeter.value);
    formData.append("strictness", strictnessSlider.value);

    let drumArrangementReady = false;

    try {
        const response = await fetch("/stream_transcript", {
            method: "POST",
            body: formData
        });

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
                    drumPlayer.src = `/static/AI_Drum_Output.mid?t=${Date.now()}`;
                    midiSection.classList.remove("hidden");
                    progressSection.classList.add("hidden");
                    processBtn.disabled = false;
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
                    continue;
                }

                if (payload.startsWith("TAAL|")) {
                    const taal = JSON.parse(payload.slice(5));
                    metaTaal.textContent = taal.name + (taal.confidence ? ` (${taal.confidence}%)` : "");
                    const description = taal.details && taal.details.description ? taal.details.description : "";
                    const display = taal.details && taal.details.display ? taal.details.display : "";
                    taalInfo.innerHTML = `<strong>${taal.name}</strong> - ${description}` +
                        (display ? `<br><span class="taal-theka">Theka: ${display}</span>` : "");
                    taalInfo.classList.remove("hidden");
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
                    continue;
                }

                if (payload.startsWith("GROOVE_PROFILE|")) {
                    const profile = JSON.parse(payload.slice(15));
                    sessionData.groove_profile = profile;
                    sessionData.avg_deviation_ms = profile.stats.avg_deviation_ms;
                    sessionData.max_deviation_ms = profile.stats.max_deviation_ms;
                    sessionData.humanize_score = profile.stats.humanize_score;
                    renderGrooveVisualizer(profile);
                    visualizerCard.classList.remove("hidden");
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
                    continue;
                }

                if (payload.startsWith("PROGRESS|")) {
                    const pct = payload.split("|")[1];
                    progressBar.style.width = `${pct}%`;
                    progressPct.textContent = `${pct}%`;
                }
            }
        }
    } catch (error) {
        console.error(error);
        progressSection.classList.add("hidden");
        processBtn.disabled = false;
        alert("Error processing file. Make sure the backend server is running.");
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
    const dpr = window.devicePixelRatio || 1;

    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = 260 * dpr;
    ctx.scale(dpr, dpr);

    const W = canvas.offsetWidth;
    const H = 260;
    const points = profile.points;
    const padLeft = 50;
    const padRight = 20;
    const padTop = 30;
    const padBottom = 40;
    const plotW = W - padLeft - padRight;
    const plotH = H - padTop - padBottom;
    const centerY = padTop + plotH / 2;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "#0d0d14";
    ctx.fillRect(0, 0, W, H);

    // Grid zone
    ctx.fillStyle = "rgba(108, 61, 255, 0.04)";
    ctx.fillRect(padLeft, padTop, plotW, plotH);

    // Grid center line (perfect quantized)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, centerY);
    ctx.lineTo(W - padRight, centerY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Zone labels
    ctx.fillStyle = "rgba(0, 212, 170, 0.5)";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Early (rushed)", padLeft - 6, padTop + 16);
    ctx.fillStyle = "rgba(255, 107, 53, 0.5)";
    ctx.fillText("Late (laid back)", padLeft - 6, H - padBottom - 6);

    // Center label
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillText("Grid", padLeft - 6, centerY + 4);

    if (points.length === 0) return;

    const maxDev = Math.max(stats.max_deviation_ms, 10);
    const scale = (plotH / 2) / maxDev;

    // Bars for each onset
    const barWidth = Math.max(2, Math.min(12, (plotW / points.length) - 2));

    points.forEach((point, i) => {
        const x = padLeft + (i / Math.max(points.length - 1, 1)) * plotW;
        const devPx = point.deviation_ms * scale;
        const barTop = point.deviation_ms < 0 ? centerY + devPx : centerY;
        const barHeight = Math.abs(devPx);

        // Green for early (negative = before grid), Orange for late (positive = after grid)
        if (point.deviation_ms < 0) {
            ctx.fillStyle = "rgba(0, 212, 170, 0.7)";
        } else {
            ctx.fillStyle = "rgba(255, 107, 53, 0.7)";
        }

        ctx.fillRect(x - barWidth / 2, barTop, barWidth, Math.max(barHeight, 1));

        // Bol label at bottom
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "9px Inter, sans-serif";
        ctx.textAlign = "center";
        if (points.length <= 60 || i % 2 === 0) {
            ctx.save();
            ctx.translate(x, H - padBottom + 12);
            ctx.rotate(-Math.PI / 4);
            ctx.fillText(point.bol, 0, 0);
            ctx.restore();
        }
    });

    // Y-axis ticks
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "10px Inter, monospace";
    ctx.textAlign = "right";
    const tickValues = [-maxDev, -maxDev / 2, 0, maxDev / 2, maxDev];
    tickValues.forEach((val) => {
        const y = centerY - val * scale;
        ctx.fillText(`${Math.round(val)}ms`, padLeft - 6, y + 3);
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(W - padRight, y);
        ctx.stroke();
    });
}

// Save to Library button
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
            saveProjectBtn.textContent = "✓ Saved!";
            saveProjectBtn.disabled = true;
            setTimeout(() => {
                saveProjectBtn.textContent = "Save to My Library";
                saveProjectBtn.disabled = false;
            }, 3000);
        } else if (data.error === "Not authenticated") {
            if (confirm("You need to log in first. Go to login page?")) {
                window.location.href = "/login";
            }
        }
    } catch (err) {
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
