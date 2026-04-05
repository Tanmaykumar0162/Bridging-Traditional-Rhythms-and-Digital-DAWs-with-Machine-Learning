import math


class RhythmicTranslationEngine:
    def __init__(self):
        self.taal_to_meter_map = {
            "Teentaal": {"beats": 16, "target_meter": "4/4", "bars": 4},
            "Keherwa": {"beats": 8, "target_meter": "4/4", "bars": 2},
            "Dadra": {"beats": 6, "target_meter": "3/4", "bars": 2},
            "Rupak": {"beats": 7, "target_meter": "7/8", "bars": 1},
            "Jhaptaal": {"beats": 10, "target_meter": "5/4", "bars": 2},
            "Ektaal": {"beats": 12, "target_meter": "3/4", "bars": 4},
        }
        self.role_weights = {
            "Dha": {"kick": 1.0, "accent": 1.0, "hat": 0.15, "tom": 0.25, "crash": 0.8},
            "Dhin": {"kick": 0.95, "accent": 0.85, "hat": 0.1, "tom": 0.15},
            "Ghe": {"kick": 0.7, "accent": 0.7, "tom": 0.8, "fill": 0.8},
            "Na": {"snare": 1.0, "accent": 0.75, "rim": 0.2},
            "Ta": {"snare": 0.9, "accent": 0.65, "rim": 0.15},
            "Tun": {"tom": 0.95, "accent": 0.6, "fill": 0.9, "hat": 0.2},
            "Tin": {"ride": 0.95, "hat": 0.55, "accent": 0.55, "fill": 0.35},
            "Ti": {"hat": 0.95, "accent": 0.3},
            "Re": {"hat": 0.75, "pedal_hat": 0.8, "accent": 0.25},
            "Ki": {"rim": 0.95, "snare": 0.35, "accent": 0.45},
            "T": {"hat": 0.9, "accent": 0.25},
            "Kat": {"rim": 0.95, "snare": 0.3, "accent": 0.45},
        }
        self.drum_display_map = {
            36: {"instrument": "Kick", "type": "dot", "text": "", "top": 128, "label": "Kick"},
            37: {"instrument": "Rim", "type": "cross", "text": "x", "top": 98, "label": "Rim"},
            38: {"instrument": "Snare", "type": "dot", "text": "", "top": 98, "label": "Snare"},
            39: {"instrument": "Clap", "type": "cross", "text": "x", "top": 98, "label": "Clap"},
            41: {"instrument": "Floor Tom", "type": "dot", "text": "", "top": 113, "label": "Floor Tom"},
            42: {"instrument": "Closed Hat", "type": "cross", "text": "x", "top": 58, "label": "Closed Hat"},
            44: {"instrument": "Pedal Hat", "type": "cross", "text": "x", "top": 148, "label": "Pedal Hat"},
            45: {"instrument": "Mid Tom", "type": "dot", "text": "", "top": 92, "label": "Mid Tom"},
            46: {"instrument": "Open Hat", "type": "cross", "text": "o", "top": 52, "label": "Open Hat"},
            48: {"instrument": "Rack Tom", "type": "dot", "text": "", "top": 82, "label": "Rack Tom"},
            49: {"instrument": "Crash", "type": "cross", "text": "x", "top": 38, "label": "Crash"},
            50: {"instrument": "High Tom", "type": "dot", "text": "", "top": 74, "label": "High Tom"},
            51: {"instrument": "Ride", "type": "cross", "text": "x", "top": 74, "label": "Ride"},
        }

    def extract_groove(self, onset_times_sec, bpm):
        if not onset_times_sec or bpm <= 0:
            return []

        seconds_per_beat = 60.0 / bpm
        groove_deltas = []

        for onset in onset_times_sec:
            ideal_beat = round(onset / seconds_per_beat)
            ideal_time = ideal_beat * seconds_per_beat
            deviation_ms = (onset - ideal_time) * 1000
            groove_deltas.append(
                {
                    "onset_sec": onset,
                    "nearest_beat": ideal_beat,
                    "human_deviation_ms": round(deviation_ms, 2),
                }
            )

        return groove_deltas

    def resolve_meter(self, source_taal=None, target_meter="auto"):
        if target_meter and target_meter not in {"auto", "native", "none"}:
            meter = target_meter
        elif source_taal in self.taal_to_meter_map:
            meter = self.taal_to_meter_map[source_taal]["target_meter"]
        else:
            meter = "4/4"

        numerator, denominator = meter.split("/")
        beats_per_bar = max(1, int(numerator))
        steps_per_beat = 4
        return {
            "meter": meter,
            "beats_per_bar": beats_per_bar,
            "denominator": int(denominator),
            "steps_per_beat": steps_per_beat,
            "steps_per_bar": beats_per_bar * steps_per_beat,
        }

    def _normalize(self, values, floor=0.25):
        if not values:
            return []

        minimum = min(values)
        maximum = max(values)
        spread = maximum - minimum

        if spread <= 1e-9:
            return [round(max(floor, 0.7), 4) for _ in values]

        return [round(floor + ((value - minimum) / spread) * (1.0 - floor), 4) for value in values]

    def _empty_bucket(self):
        return {
            "kick": 0.0,
            "snare": 0.0,
            "hat": 0.0,
            "ride": 0.0,
            "pedal_hat": 0.0,
            "rim": 0.0,
            "tom": 0.0,
            "fill": 0.0,
            "accent": 0.0,
            "crash": 0.0,
            "source_bols": [],
            "deviations": [],
        }

    def _kick_anchors(self, meter):
        return {
            "4/4": {0: 1.15, 8: 0.55, 10: 0.25, 14: 0.18},
            "3/4": {0: 1.1, 8: 0.45},
            "5/4": {0: 1.1, 8: 0.35, 16: 0.75},
            "7/8": {0: 1.05, 8: 0.55, 16: 0.45, 22: 0.35},
        }.get(meter, {0: 1.1})

    def _snare_anchors(self, meter):
        return {
            "4/4": {4: 1.05, 12: 1.1},
            "3/4": {4: 0.95, 8: 0.85},
            "5/4": {8: 0.9, 16: 1.0},
            "7/8": {8: 0.85, 18: 0.95},
        }.get(meter, {})

    def _hat_steps(self, hat_mode, steps_per_bar):
        if hat_mode == "16th":
            return set(range(steps_per_bar))
        return {index for index in range(steps_per_bar) if index % 2 == 0}

    def _position_label(self, step_in_bar, steps_per_beat):
        beat = (step_in_bar // steps_per_beat) + 1
        subdivision = step_in_bar % steps_per_beat
        suffix = ["", "e", "&", "a"][subdivision]
        return f"{beat}{suffix}"

    def _append_note(self, note_list, midi_note, velocity):
        if any(note["midi"] == midi_note for note in note_list):
            return

        display = self.drum_display_map[midi_note]
        note_list.append(
            {
                "midi": midi_note,
                "velocity": int(max(35, min(127, round(velocity)))),
                "instrument": display["instrument"],
                "type": display["type"],
                "text": display["text"],
                "top": display["top"],
                "label": display["label"],
            }
        )

    def build_drum_arrangement(
        self,
        bols,
        onset_times_sec,
        bpm,
        confidences=None,
        accent_profile=None,
        source_taal=None,
        target_meter="auto",
        strictness=0.7,
    ):
        if not bols or not onset_times_sec:
            meter_info = self.resolve_meter(source_taal=source_taal, target_meter=target_meter)
            return {
                "meter": meter_info["meter"],
                "beats_per_bar": meter_info["beats_per_bar"],
                "bars": 0,
                "hat_mode": "8th",
                "summary": "No rhythmic content detected.",
                "display_steps": [],
                "note_events": [],
            }

        strictness = max(0.0, min(1.0, float(strictness)))
        meter_info = self.resolve_meter(source_taal=source_taal, target_meter=target_meter)
        beats_per_bar = meter_info["beats_per_bar"]
        steps_per_beat = meter_info["steps_per_beat"]
        steps_per_bar = meter_info["steps_per_bar"]
        seconds_per_beat = 60.0 / max(float(bpm), 1.0)
        step_duration = seconds_per_beat / steps_per_beat

        confidences = confidences or [0.75] * len(bols)
        if len(confidences) < len(bols):
            confidences = confidences + [confidences[-1] if confidences else 0.75] * (len(bols) - len(confidences))

        if accent_profile:
            normalized_accents = self._normalize(accent_profile, floor=0.35)
        else:
            normalized_accents = [0.65] * len(bols)

        max_onset = max(onset_times_sec)
        estimated_beats = max(
            beats_per_bar,
            int(math.ceil((max_onset + (2 * step_duration)) / max(seconds_per_beat, 1e-6))),
        )
        bar_count = max(1, int(math.ceil(estimated_beats / beats_per_bar)))
        total_steps = bar_count * steps_per_bar
        buckets = [self._empty_bucket() for _ in range(total_steps)]

        for index, bol in enumerate(bols):
            if index >= len(onset_times_sec):
                break

            onset = float(onset_times_sec[index])
            step_float = onset / max(step_duration, 1e-6)
            step_index = int(round(step_float))
            step_index = max(0, min(total_steps - 1, step_index))
            deviation_sec = onset - (step_index * step_duration)

            confidence = float(confidences[index]) if index < len(confidences) else 0.75
            accent = float(normalized_accents[index]) if index < len(normalized_accents) else 0.65
            intensity = (0.62 * confidence) + (0.38 * accent)

            bucket = buckets[step_index]
            role_map = self.role_weights.get(bol, {})
            for role_name, role_weight in role_map.items():
                if role_name in bucket:
                    bucket[role_name] += role_weight * intensity

            bucket["accent"] += intensity
            bucket["source_bols"].append(bol)
            bucket["deviations"].append(deviation_sec)

        used_steps = sum(1 for bucket in buckets if bucket["source_bols"])
        source_density = used_steps / max(total_steps, 1)
        hat_mode = "16th" if source_density >= 0.35 or bpm >= 122 else "8th"
        hat_steps = self._hat_steps(hat_mode, steps_per_bar)
        kick_anchors = self._kick_anchors(meter_info["meter"])
        snare_anchors = self._snare_anchors(meter_info["meter"])
        phrase_span = 4 if bar_count >= 4 else max(1, bar_count)
        use_ride = bpm < 105 and any(bucket["ride"] > 0.45 for bucket in buckets)

        arrangement_steps = []
        for step_index, bucket in enumerate(buckets):
            step_in_bar = step_index % steps_per_bar
            bar_number = (step_index // steps_per_bar) + 1
            human_offset_sec = 0.0
            if bucket["deviations"]:
                average_deviation = sum(bucket["deviations"]) / len(bucket["deviations"])
                human_offset_sec = max(-0.04, min(0.04, average_deviation * strictness))

            notes = []
            kick_score = bucket["kick"] + kick_anchors.get(step_in_bar, 0.0) + (0.22 * bucket["accent"])
            snare_score = bucket["snare"] + snare_anchors.get(step_in_bar, 0.0) + (0.18 * bucket["rim"])
            hat_score = bucket["hat"] + (0.18 if step_in_bar in hat_steps else 0.0)
            tom_score = bucket["tom"] + (0.35 * bucket["fill"])

            # Ensure a much richer, "well-heard" groove by lowering thresholds
            # and adding structural anchors unconditionally so the beat is always driving.
            
            # Kick: Always hit on beat 1, and lower threshold for extra kicks
            if step_in_bar == 0 or kick_score >= 0.65:
                self._append_note(notes, 36, 84 + (kick_score * 22))

            # Snare: Strong backbeats and distinct ghost notes for groove
            if step_in_bar in snare_anchors or snare_score >= 0.75:
                self._append_note(notes, 38, 76 + (snare_score * 24))
                if step_in_bar in snare_anchors and bucket["accent"] > 0.60:
                    self._append_note(notes, 39, 58 + (bucket["accent"] * 18))  # Add claps/rims on heavy accents
            elif snare_score > 0.45:
                self._append_note(notes, 38, 45 + (snare_score * 20)) # Ghost snare

            # Hi-Hats / Ride: Continuous driving pattern
            if step_in_bar in hat_steps:
                if (use_ride or bpm > 130) and step_in_bar % (steps_per_beat//2) == 0:
                    self._append_note(notes, 51, 60 + (bucket["ride"] * 20))
                else:
                    # Occasional open hi-hat on the upbeat
                    hat_note = 46 if step_in_bar % 8 == 6 and bucket["accent"] > 0.5 else 42
                    hat_velocity = 55 + (hat_score * 30) + (10 if step_in_bar % 4 == 2 else 0)
                    self._append_note(notes, hat_note, hat_velocity)

            # Pedal hi-hat for time-keeping
            if step_in_bar % steps_per_beat == 0:
                self._append_note(notes, 44, 55 + (bucket["pedal_hat"] * 15))

            # Toms: Lower threshold so melodic tabla rolls translate into tom rolls
            if tom_score > 0.65 and step_in_bar not in snare_anchors:
                tom_note = 41 if bucket["kick"] >= bucket["ride"] else 48
                if bucket["source_bols"] and bucket["source_bols"][-1] in {"Tun", "Ta"}:
                    tom_note = 50
                self._append_note(notes, tom_note, 68 + (tom_score * 18))

            # Crashes for emphasis and phrasing
            is_phrase_start = step_in_bar == 0 and ((bar_number - 1) % phrase_span == 0)
            if bucket["crash"] > 0.4 or is_phrase_start:
                self._append_note(notes, 49, 90 + (bucket["accent"] * 15))

            source_hint = " ".join(bucket["source_bols"][:3])
            arrangement_steps.append(
                {
                    "index": step_index,
                    "bar": bar_number,
                    "position": self._position_label(step_in_bar, steps_per_beat),
                    "is_bar_start": step_in_bar == 0,
                    "human_offset_sec": human_offset_sec,
                    "source_hint": source_hint,
                    "notes": notes,
                }
            )

        for bar_index in range(bar_count):
            is_phrase_end = ((bar_index + 1) % phrase_span == 0) or (bar_index == bar_count - 1)
            if not is_phrase_end:
                continue

            fill_start = (bar_index * steps_per_bar) + max(0, steps_per_bar - 4)
            fill_end = min(fill_start + 4, len(arrangement_steps))
            fill_energy = 0.0
            for step_cursor in range(fill_start, fill_end):
                bucket = buckets[step_cursor]
                fill_energy += bucket["tom"] + bucket["fill"] + (0.2 * bucket["accent"])

            if fill_energy < 1.05:
                continue

            fill_notes = [41, 45, 48, 50]
            for offset, step_cursor in enumerate(range(fill_start, fill_end)):
                notes = arrangement_steps[step_cursor]["notes"]
                tom_note = fill_notes[min(offset, len(fill_notes) - 1)]
                self._append_note(notes, tom_note, 72 + (offset * 9))
                if offset == (fill_end - fill_start - 1):
                    self._append_note(notes, 49, 88)

        note_events = []
        display_steps = []
        for step in arrangement_steps:
            if not step["notes"]:
                continue

            base_time = (step["index"] * step_duration) + step["human_offset_sec"]
            base_time = max(0.0, base_time)
            display_steps.append(
                {
                    "bar": step["bar"],
                    "position": step["position"],
                    "is_bar_start": step["is_bar_start"],
                    "source_hint": step["source_hint"],
                    "notes": step["notes"],
                }
            )

            for note in step["notes"]:
                duration_sec = 0.07 if note["midi"] in {42, 44, 46, 49, 51, 39, 37} else 0.12
                note_events.append(
                    {
                        "time_sec": round(base_time, 6),
                        "duration_sec": duration_sec,
                        "midi": note["midi"],
                        "velocity": note["velocity"],
                    }
                )

        summary = (
            f"{bar_count} bar groove in {meter_info['meter']} with {hat_mode} hats "
            f"and human-feel amount {strictness:.2f}"
        )

        return {
            "meter": meter_info["meter"],
            "beats_per_bar": beats_per_bar,
            "bars": bar_count,
            "hat_mode": hat_mode,
            "summary": summary,
            "source_density": round(source_density, 3),
            "display_steps": display_steps,
            "note_events": note_events,
        }

    def remap_rhythm_to_western(
        self,
        bols,
        onset_times_sec,
        bpm,
        source_taal,
        target_meter="4/4",
        strictness=0.5,
    ):
        mapping_result = []
        if len(bols) != len(onset_times_sec) or bpm <= 0:
            return mapping_result

        seconds_per_beat = 60.0 / bpm
        beats_per_bar = int(target_meter.split("/")[0])

        for index, bol in enumerate(bols):
            original_onset = onset_times_sec[index]
            ideal_beat = round(original_onset / seconds_per_beat)
            ideal_time = ideal_beat * seconds_per_beat
            western_bar = (ideal_beat // beats_per_bar) + 1
            beat_in_bar = (ideal_beat % beats_per_bar) + 1
            deviation = original_onset - ideal_time
            remapped_onset = ideal_time + (deviation * strictness)

            mapping_result.append(
                {
                    "bol": bol,
                    "original_onset": round(original_onset, 3),
                    "remapped_onset": round(remapped_onset, 3),
                    "western_bar": western_bar,
                    "beat_in_bar": beat_in_bar,
                }
            )

        return mapping_result


translator = RhythmicTranslationEngine()
