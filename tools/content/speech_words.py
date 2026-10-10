"""Recognises the words of an Arabic recording locally and prints them with their seconds.

    python3 tools/content/speech_words.py lesson.mp3 > words.json

Used by madinah-book-sync.mjs to find when each line of the book is read. Runs Whisper on
this machine (faster-whisper, CPU): the recording is never sent anywhere. Output is a JSON
list of {"w": word, "s": start, "e": end}. The model is SUFFA_WHISPER_MODEL
(default large-v3-turbo: about 2.5 times faster than real time on four cores).
"""

import json
import os
import sys

from faster_whisper import WhisperModel


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: speech_words.py <audio file>")
    model = WhisperModel(
        os.environ.get("SUFFA_WHISPER_MODEL", "large-v3-turbo"),
        device="cpu",
        compute_type="int8",
    )
    segments, _info = model.transcribe(
        sys.argv[1],
        language="ar",
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 400},
        beam_size=1,
        # Each stretch on its own: the reader repeats lines, and carrying the text over makes
        # Whisper drop or loop repeated words.
        condition_on_previous_text=False,
    )
    words = [
        {"w": word.word.strip(), "s": round(word.start, 2), "e": round(word.end, 2)}
        for segment in segments
        for word in segment.words or []
    ]
    json.dump(words, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
