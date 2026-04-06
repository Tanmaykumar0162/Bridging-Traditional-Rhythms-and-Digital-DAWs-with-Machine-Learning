import asyncio
import json
import os

import librosa
import mido
import numpy as np
import tensorflow as tf
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from mido import Message, MidiFile, MidiTrack
from pydub import AudioSegment

from rhythm_translator import translator
from database import (
    register_user,
    authenticate_user,
    create_session,
    get_user_from_session,
    delete_session,
    save_project,
    get_user_projects,
    rename_project,
    delete_project,
)


app = FastAPI(title="TablatoDrum - Tabla to Drum Groove Generator")

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")
templates = Jinja2Templates(directory="frontend")

MODEL_PATH = "./models/tabla_cnn_precision.h5"
print("[*] Loading CNN Model for Web App...")
model = tf.keras.models.load_model(MODEL_PATH)

CLASSES = ["Dha", "Dhin", "Ghe", "Na", "Ta", "Tun", "Tin", "Ti", "Re", "Ki", "T", "Kat"]

DRUM_TEXT_MAP = {
    "Dha": "[Accent Bass]",
    "Dhin": "[Kick Anchor]",
    "Ghe": "[Low End Fill]",
    "Na": "[Backbeat]",
    "Ta": "[Backbeat]",
    "Tun": "[Tom Fill]",
    "Tin": "[Ride Accent]",
    "Ti": "[Top Groove]",
    "Re": "[Pedal Time]",
    "Ki": "[Rim Accent]",
    "T": "[Hat Pulse]",
    "Kat": "[Rim Accent]",
}

TAAL_DEFINITIONS = {
    "Teentaal": {
        "beats": 16,
        "vibhaag": [4, 4, 4, 4],
        "taali": [1, 5, 13],
        "khali": [9],
        "sam": 1,
        "display": "Dha Dhin Dhin Dha | Dha Dhin Dhin Dha | Dha Tin Tin Ta | Ta Dhin Dhin Dha",
        "markers": ["X", "2", "0", "3"],
        "description": "16 beats, 4 vibhaags - the most common taal in Hindustani music",
    },
    "Keherwa": {
        "beats": 8,
        "vibhaag": [4, 4],
        "taali": [1],
        "khali": [5],
        "sam": 1,
        "display": "Dha Ge Na Ti | Na Ka Dhin Na",
        "markers": ["X", "0"],
        "description": "8 beats, 2 vibhaags - light and popular folk taal",
    },
    "Jhaptaal": {
        "beats": 10,
        "vibhaag": [2, 3, 2, 3],
        "taali": [1, 3, 8],
        "khali": [6],
        "sam": 1,
        "display": "Dhi Na | Dhi Dhi Na | Ti Na | Dhi Dhi Na",
        "markers": ["X", "2", "0", "3"],
        "description": "10 beats, 4 vibhaags - classical asymmetric taal",
    },
    "Rupak": {
        "beats": 7,
        "vibhaag": [3, 2, 2],
        "taali": [4, 6],
        "khali": [1],
        "sam": 1,
        "display": "Tin Tin Na | Dhin Na | Dhin Na",
        "markers": ["0", "X", "2"],
        "description": "7 beats, 3 vibhaags - starts on khali",
    },
    "Dadra": {
        "beats": 6,
        "vibhaag": [3, 3],
        "taali": [1],
        "khali": [4],
        "sam": 1,
        "display": "Dha Dhin Na | Dha Tin Na",
        "markers": ["X", "0"],
        "description": "6 beats, 2 vibhaags - light classical taal",
    },
    "Ektaal": {
        "beats": 12,
        "vibhaag": [2, 2, 2, 2, 2, 2],
        "taali": [1, 5, 9, 11],
        "khali": [3, 7],
        "sam": 1,
        "display": "Dhin Dhin | Dha Ge | Tin Tin | Na Kat | Dhi Na | Dha Ge",
        "markers": ["X", "0", "2", "0", "3", "4"],
        "description": "12 beats, 6 vibhaags - slow classical compositions",
    },
}


def detect_bpm_from_onsets(onsets, sr):
    if len(onsets) < 2:
        return 120.0, "Madhya"

    onset_times = onsets / sr
    iois = np.diff(onset_times)
    valid_iois = iois[(iois > 0.1) & (iois < 2.0)]

    if len(valid_iois) == 0:
        return 120.0, "Madhya"

    median_ioi = np.median(valid_iois)
    bpm = 60.0 / median_ioi

    while bpm > 300:
        bpm /= 2
    while bpm < 40:
        bpm *= 2

    bpm = round(bpm, 1)

    if bpm < 80:
        laya = "Vilambit (Slow)"
    elif bpm < 160:
        laya = "Madhya (Medium)"
    else:
        laya = "Drut (Fast)"

    return bpm, laya


def detect_taal(bol_sequence):
    n = len(bol_sequence)
    if n == 0:
        return None

    theka_patterns = {
        "Teentaal": ["Dha", "Dhin", "Dhin", "Dha", "Dha", "Dhin", "Dhin", "Dha", "Dha", "Tin", "Tin", "Ta", "Ta", "Dhin", "Dhin", "Dha"],
        "Keherwa": ["Dha", "Ghe", "Na", "Ti", "Na", "Ki", "Dhin", "Na"],
        "Jhaptaal": ["Dhin", "Na", "Dhin", "Dhin", "Na", "Tin", "Na", "Dhin", "Dhin", "Na"],
        "Rupak": ["Tin", "Tin", "Na", "Dhin", "Na", "Dhin", "Na"],
        "Dadra": ["Dha", "Dhin", "Na", "Dha", "Tin", "Na"],
        "Ektaal": ["Dhin", "Dhin", "Dha", "Ghe", "Tin", "Tin", "Na", "Kat", "Dhin", "Na", "Dha", "Ghe"],
    }

    best_taal = None
    best_score = 0.0

    for taal_name, theka in theka_patterns.items():
        cycle_len = len(theka)
        matches = sum(1 for i in range(n) if bol_sequence[i] == theka[i % cycle_len])
        score = matches / n
        if n >= cycle_len and n % cycle_len == 0:
            score += 0.05
        if score > best_score:
            best_score = score
            best_taal = taal_name

    if best_score >= 0.15:
        return {
            "name": best_taal,
            "confidence": round(best_score * 100, 1),
            "details": TAAL_DEFINITIONS.get(best_taal, {}),
        }

    return {
        "name": "Unknown / Free Rhythm",
        "confidence": 0,
        "details": {
            "beats": n,
            "vibhaag": [],
            "markers": [],
            "description": "Could not identify a standard taal - likely free-form phrasing",
        },
    }


def generate_enhanced_midi(drum_arrangement, bpm, output_path):
    mid = MidiFile(ticks_per_beat=480)
    tempo_bpm = max(40, int(round(bpm)))
    tempo = mido.bpm2tempo(tempo_bpm)
    meter = drum_arrangement.get("meter", "4/4")
    numerator, denominator = meter.split("/")

    meta_track = MidiTrack()
    mid.tracks.append(meta_track)
    meta_track.append(mido.MetaMessage("track_name", name="Tabla to Drum Groove", time=0))
    meta_track.append(mido.MetaMessage("set_tempo", tempo=tempo, time=0))
    meta_track.append(
        mido.MetaMessage(
            "time_signature",
            numerator=int(numerator),
            denominator=int(denominator),
            time=0,
        )
    )

    drum_track = MidiTrack()
    mid.tracks.append(drum_track)
    drum_track.append(mido.MetaMessage("track_name", name="AI Drum Dhun", time=0))

    note_events = drum_arrangement.get("note_events", [])
    if not note_events:
        mid.save(output_path)
        return

    midi_events = []
    for event in note_events:
        start_tick = int(round(mido.second2tick(event["time_sec"], mid.ticks_per_beat, tempo)))
        end_tick = int(
            round(
                mido.second2tick(
                    event["time_sec"] + event.get("duration_sec", 0.1),
                    mid.ticks_per_beat,
                    tempo,
                )
            )
        )
        end_tick = max(start_tick + 1, end_tick)
        midi_events.append((start_tick, 0, event["midi"], event["velocity"]))
        midi_events.append((end_tick, 1, event["midi"], 0))

    midi_events.sort(key=lambda item: (item[0], item[1], item[2]))

    previous_tick = 0
    for absolute_tick, event_order, midi_note, velocity in midi_events:
        delta = max(0, absolute_tick - previous_tick)
        message_type = "note_on" if event_order == 0 else "note_off"
        drum_track.append(Message(message_type, note=midi_note, velocity=velocity, time=delta, channel=9))
        previous_tick = absolute_tick

    mid.save(output_path)


def generate_groove_template_midi(onset_times_sec, bpm, output_path):
    mid = MidiFile(ticks_per_beat=480)
    tempo_bpm = max(40, int(round(bpm)))
    tempo = mido.bpm2tempo(tempo_bpm)

    meta_track = MidiTrack()
    mid.tracks.append(meta_track)
    meta_track.append(mido.MetaMessage("track_name", name="Tabla Groove Template", time=0))
    meta_track.append(mido.MetaMessage("set_tempo", tempo=tempo, time=0))
    meta_track.append(mido.MetaMessage("time_signature", numerator=4, denominator=4, time=0))

    groove_track = MidiTrack()
    mid.tracks.append(groove_track)
    groove_track.append(mido.MetaMessage("track_name", name="Human Timing Offsets", time=0))

    if not onset_times_sec:
        mid.save(output_path)
        return

    midi_events = []
    for onset in onset_times_sec:
        start_tick = int(round(mido.second2tick(float(onset), mid.ticks_per_beat, tempo)))
        end_tick = start_tick + (mid.ticks_per_beat // 4) # Short 16th note length
        # Using Side Stick (Rimshot) 37 for clear click mapping in DAWs
        midi_events.append((start_tick, 0, 37, 100))
        midi_events.append((end_tick, 1, 37, 0))

    midi_events.sort(key=lambda item: (item[0], item[1], item[2]))

    previous_tick = 0
    for absolute_tick, event_order, midi_note, velocity in midi_events:
        delta = max(0, absolute_tick - previous_tick)
        message_type = "note_on" if event_order == 0 else "note_off"
        groove_track.append(Message(message_type, note=midi_note, velocity=velocity, time=delta, channel=9))
        previous_tick = absolute_tick

    mid.save(output_path)


def _get_current_user(request: Request):
    token = request.cookies.get("session_token")
    return get_user_from_session(token)


@app.get("/")
async def home(request: Request):
    user = _get_current_user(request)
    return templates.TemplateResponse("index.html", {"request": request, "user": user})


@app.get("/studio")
async def studio(request: Request):
    user = _get_current_user(request)
    return templates.TemplateResponse("studio.html", {"request": request, "user": user})


@app.get("/dashboard")
async def dashboard(request: Request):
    user = _get_current_user(request)
    if not user:
        return RedirectResponse("/login", status_code=302)
    projects = get_user_projects(user["id"])
    return templates.TemplateResponse("dashboard.html", {"request": request, "user": user, "projects": projects})


@app.get("/login")
async def login_page(request: Request):
    user = _get_current_user(request)
    if user:
        return RedirectResponse("/dashboard", status_code=302)
    return templates.TemplateResponse("login.html", {"request": request, "user": None, "error": None})


@app.post("/login")
async def login_submit(request: Request):
    form = await request.form()
    username = form.get("username", "").strip()
    password = form.get("password", "")
    user_id = authenticate_user(username, password)
    if user_id:
        token = create_session(user_id)
        response = RedirectResponse("/dashboard", status_code=302)
        response.set_cookie("session_token", token, httponly=True, max_age=86400 * 7)
        return response
    return templates.TemplateResponse("login.html", {"request": request, "user": None, "error": "Invalid username or password"})


@app.get("/register")
async def register_page(request: Request):
    user = _get_current_user(request)
    if user:
        return RedirectResponse("/dashboard", status_code=302)
    return templates.TemplateResponse("register.html", {"request": request, "user": None, "error": None})


@app.post("/register")
async def register_submit(request: Request):
    form = await request.form()
    username = form.get("username", "").strip()
    password = form.get("password", "")
    if len(username) < 3 or len(password) < 4:
        return templates.TemplateResponse("register.html", {"request": request, "user": None, "error": "Username must be 3+ chars, password 4+ chars"})
    success, msg = register_user(username, password)
    if success:
        user_id = authenticate_user(username, password)
        token = create_session(user_id)
        response = RedirectResponse("/dashboard", status_code=302)
        response.set_cookie("session_token", token, httponly=True, max_age=86400 * 7)
        return response
    return templates.TemplateResponse("register.html", {"request": request, "user": None, "error": msg})


@app.get("/logout")
async def logout(request: Request):
    token = request.cookies.get("session_token")
    if token:
        delete_session(token)
    response = RedirectResponse("/", status_code=302)
    response.delete_cookie("session_token")
    return response


@app.get("/api/model-info")
async def model_info():
    layers = []
    for layer in model.layers:
        layers.append(
            {
                "name": layer.name,
                "type": layer.__class__.__name__,
                "output_shape": str(layer.output_shape) if hasattr(layer, "output_shape") else "N/A",
                "params": layer.count_params(),
            }
        )

    return JSONResponse(
        {
            "model_name": "Tabla CNN Classifier",
            "total_params": model.count_params(),
            "classes": CLASSES,
            "input_shape": "(13, 13, 2)",
            "feature_desc": "Dual-channel: 13 MFCCs + 13 Chroma features (first 13 frames)",
            "layers": layers,
            "taal_definitions": TAAL_DEFINITIONS,
        }
    )


@app.post("/stream_transcript")
async def stream_transcript(
    file: UploadFile = File(...),
    target_meter: str = Form("auto"),
    strictness: float = Form(0.72),
):
    safe_name = os.path.basename(file.filename or "tabla_input.wav")
    temp_audio_path = f"static/temp_{safe_name}"
    with open(temp_audio_path, "wb") as buffer:
        buffer.write(await file.read())

    if temp_audio_path.lower().endswith((".mp3", ".mpeg", ".m4a", ".webm", ".ogg")):
        print(f"[*] Converting {safe_name} to WAV format...")
        audio = AudioSegment.from_file(temp_audio_path)
        converted_path = temp_audio_path.rsplit(".", 1)[0] + ".wav"
        audio.export(converted_path, format="wav")
        os.remove(temp_audio_path)
        temp_audio_path = converted_path
        print("[+] Conversion complete!")

    async def process_and_stream():
        y, sr = librosa.load(temp_audio_path, sr=44100)
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        onsets = librosa.onset.onset_detect(
            onset_envelope=onset_env,
            sr=sr,
            units="samples",
            backtrack=True,
            pre_max=5,
            post_max=5,
            delta=0.1,
            wait=15,
        )

        target_samples = 72000
        predicted_sequence = []
        confidence_scores = []
        raw_accent_scores = []
        onset_times_sec = onsets / sr

        bpm, laya = detect_bpm_from_onsets(onsets, sr)
        total_strokes = len(onsets)

        yield (
            "data: META|"
            f"{json.dumps({'bpm': bpm, 'laya': laya, 'total_strokes': total_strokes, 'duration': round(len(y) / sr, 2)})}\n\n"
        )

        for index, onset in enumerate(onsets):
            stroke = y[onset : onset + target_samples]
            if len(stroke) < target_samples:
                stroke = np.pad(stroke, (0, target_samples - len(stroke)), "constant")
            else:
                stroke = stroke[:target_samples]

            accent_window = stroke[: min(len(stroke), int(sr * 0.35))]
            if len(accent_window) == 0:
                raw_accent_scores.append(0.0)
            else:
                stroke_peak = float(np.max(np.abs(accent_window)))
                stroke_rms = float(np.sqrt(np.mean(np.square(accent_window))))
                raw_accent_scores.append((0.65 * stroke_peak) + (0.35 * stroke_rms))

            mfcc = librosa.feature.mfcc(y=stroke, sr=sr, n_mfcc=13)[:, :13]
            chroma = librosa.feature.chroma_stft(y=stroke, sr=sr, n_chroma=13)[:, :13]

            if mfcc.shape[1] < 13:
                pad_width = 13 - mfcc.shape[1]
                mfcc = np.pad(mfcc, ((0, 0), (0, pad_width)))
                chroma = np.pad(chroma, ((0, 0), (0, pad_width)))

            tensor = np.stack((mfcc, chroma), axis=-1)
            prediction = model.predict(np.expand_dims(tensor, axis=0), verbose=0)
            class_idx = int(np.argmax(prediction))
            confidence = float(np.max(prediction))
            bol = CLASSES[class_idx]

            predicted_sequence.append(bol)
            confidence_scores.append(confidence)

            drum_name = DRUM_TEXT_MAP.get(bol, "[Groove]")
            yield f"data: {bol}|{drum_name}|{confidence:.3f}\n\n"

            progress_pct = int(((index + 1) / max(total_strokes, 1)) * 100)
            yield f"data: PROGRESS|{progress_pct}\n\n"

            await asyncio.sleep(0)

        taal_result = detect_taal(predicted_sequence)
        yield f"data: TAAL|{json.dumps(taal_result)}\n\n"

        groove_source_taal = None
        if taal_result and taal_result.get("name") not in {"Unknown / Free Rhythm", None}:
            groove_source_taal = taal_result["name"]

        drum_arrangement = translator.build_drum_arrangement(
            bols=predicted_sequence,
            onset_times_sec=onset_times_sec.tolist(),
            bpm=bpm,
            confidences=confidence_scores,
            accent_profile=raw_accent_scores,
            source_taal=groove_source_taal,
            target_meter=target_meter,
            strictness=strictness,
        )

        groove_payload = {
            "meter": drum_arrangement["meter"],
            "bars": drum_arrangement["bars"],
            "hat_mode": drum_arrangement["hat_mode"],
            "summary": drum_arrangement["summary"],
        }
        yield f"data: GROOVE|{json.dumps(groove_payload)}\n\n"

        output_midi_path = "static/AI_Drum_Output.mid"
        generate_enhanced_midi(drum_arrangement, bpm, output_midi_path)

        groove_template_path = "static/Tabla_Groove_Template.mid"
        generate_groove_template_midi(onset_times_sec.tolist(), bpm, groove_template_path)

        # Compute per-beat groove profile for the Quantize vs Humanize visualizer
        seconds_per_beat = 60.0 / max(float(bpm), 1.0)
        groove_profile_points = []
        for idx, onset_sec in enumerate(onset_times_sec.tolist()):
            nearest_beat = round(onset_sec / seconds_per_beat)
            grid_time = nearest_beat * seconds_per_beat
            deviation_ms = round((onset_sec - grid_time) * 1000, 2)
            groove_profile_points.append({
                "index": idx,
                "onset_sec": round(onset_sec, 4),
                "grid_sec": round(grid_time, 4),
                "deviation_ms": deviation_ms,
                "bol": predicted_sequence[idx] if idx < len(predicted_sequence) else "?",
            })

        abs_devs = [abs(p["deviation_ms"]) for p in groove_profile_points]
        avg_deviation = round(sum(abs_devs) / max(len(abs_devs), 1), 2)
        max_deviation = round(max(abs_devs) if abs_devs else 0, 2)
        humanize_score = round(min(100, (avg_deviation / 40) * 100), 1)

        groove_profile_payload = {
            "points": groove_profile_points,
            "stats": {
                "avg_deviation_ms": avg_deviation,
                "max_deviation_ms": max_deviation,
                "humanize_score": humanize_score,
                "total_onsets": len(groove_profile_points),
            },
        }
        yield f"data: GROOVE_PROFILE|{json.dumps(groove_profile_payload)}\n\n"

        yield (
            "data: SEQUENCE|"
            f"{json.dumps({'bols': predicted_sequence, 'confidences': [round(score, 3) for score in confidence_scores]})}\n\n"
        )
        yield (
            "data: DRUM_SEQUENCE|"
            f"{json.dumps({'meter': drum_arrangement['meter'], 'bars': drum_arrangement['bars'], 'hat_mode': drum_arrangement['hat_mode'], 'summary': drum_arrangement['summary'], 'steps': drum_arrangement['display_steps']})}\n\n"
        )
        yield "data: DONE\n\n"

    return StreamingResponse(process_and_stream(), media_type="text/event-stream")


@app.post("/api/save-project")
async def api_save_project(request: Request):
    user = _get_current_user(request)
    if not user:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    data = await request.json()
    project_id = save_project(user["id"], data)
    return JSONResponse({"status": "saved", "project_id": project_id})


@app.put("/api/projects/{project_id}/rename")
async def api_rename_project(project_id: int, request: Request):
    user = _get_current_user(request)
    if not user:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    data = await request.json()
    new_name = data.get("name", "").strip()
    if not new_name:
        return JSONResponse({"error": "Name cannot be empty"}, status_code=400)
    rename_project(project_id, user["id"], new_name)
    return JSONResponse({"status": "renamed"})


@app.delete("/api/projects/{project_id}")
async def api_delete_project(project_id: int, request: Request):
    user = _get_current_user(request)
    if not user:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    delete_project(project_id, user["id"])
    return JSONResponse({"status": "deleted"})


@app.get("/api/projects")
async def api_list_projects(request: Request):
    user = _get_current_user(request)
    if not user:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)
    projects = get_user_projects(user["id"])
    return JSONResponse({"projects": projects})


@app.get("/download-midi")
async def download_midi():
    path = "static/AI_Drum_Output.mid"
    if os.path.exists(path):
        return FileResponse(path, media_type="audio/midi", filename="TablatoDrum_Output.mid")
    return JSONResponse({"error": "No MIDI file generated yet"}, status_code=404)


@app.get("/download-groove")
async def download_groove():
    path = "static/Tabla_Groove_Template.mid"
    if os.path.exists(path):
        return FileResponse(path, media_type="audio/midi", filename="Tabla_Swing_Template.mid")
    return JSONResponse({"error": "No Groove Template generated yet"}, status_code=404)


@app.post("/api/v1/style-transfer")
async def style_transfer(request: Request):
    data = await request.json()
    bpm = float(data.get("bpm", 120))
    onsets = data.get("onsets", [])
    bols = data.get("sequence", [])
    strictness = float(data.get("strictness", 0.5))
    target_meter = data.get("target_meter", "4/4")

    resolved_meter = translator.resolve_meter(
        source_taal=data.get("source_taal"),
        target_meter=target_meter,
    )["meter"]

    remapped_groove = translator.remap_rhythm_to_western(
        bols=bols,
        onset_times_sec=onsets,
        bpm=bpm,
        source_taal=data.get("source_taal", "Teentaal"),
        target_meter=resolved_meter,
        strictness=strictness,
    )

    arrangement = translator.build_drum_arrangement(
        bols=bols,
        onset_times_sec=onsets,
        bpm=bpm,
        confidences=[1.0] * len(bols),
        accent_profile=[0.7] * len(bols),
        source_taal=data.get("source_taal"),
        target_meter=target_meter,
        strictness=strictness,
    )

    return JSONResponse(
        {
            "status": "success",
            "message": "Groove translated into a production-ready drum arrangement.",
            "remapped_groove": remapped_groove,
            "arrangement": arrangement,
        }
    )
