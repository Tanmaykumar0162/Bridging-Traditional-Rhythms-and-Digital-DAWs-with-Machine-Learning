# 🎵 Rhythm Translator

A deep learning application that detects the rhythmic pattern of an input audio file and translates it into a different music style. Built with Python and FastAPI, it exposes a REST API that accepts audio input and returns the translated rhythm using a trained ML model.

---

## 🛠️ Tech Stack

`Python` `FastAPI` `LibROSA` `TensorFlow / PyTorch` `Jupyter Notebook`

---

## 📁 Project Structure

```
rhythm-translator/
├── app.py                  # FastAPI entry point
├── rhythm_translator.py    # Core translation logic
├── frontend/               # UI files
├── models/                 # Trained model weights
├── notebooks/              # Training & experimentation
└── README.md
```

---

## 🚀 Setup & Run

```bash
git clone https://github.com/yourusername/rhythm-translator.git
cd rhythm-translator
pip install -r requirements.txt
uvicorn app:app --reload
```

API docs available at `http://127.0.0.1:8000/docs`

---

## 📦 Dataset

Dataset not included due to size. Download from *(add link)* and place in `/dataset` folder.

---

## 👤 Author

**Tanmay** — [LinkedIn](https://linkedin.com/in/tanmayksahu62)
