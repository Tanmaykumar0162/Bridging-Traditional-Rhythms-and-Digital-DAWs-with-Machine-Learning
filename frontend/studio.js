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
const notesCanvas = document.getElementById("notes-canvas");
const midiSection = document.getElementById("midi-section");
const drumPlayer = document.getElementById("drumPlayer");
const downloadBtn = document.getElementById("downloadBtn");

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
    midiSection.classList.add("hidden");
    bolGrid.innerHTML = "";
    notesCanvas.innerHTML = "";
    taalInfo.classList.add("hidden");
    taalInfo.innerHTML = "";

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
