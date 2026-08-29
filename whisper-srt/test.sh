#!/bin/bash

MOVIE='/mnt/f/Yuru Camp Live Action 1080p S2 10bit/[Shiniori-Raws] Yuru Camp 2 Live Action - 00 (BD 1920x1080 x264 10bit FLAC).mkv'

MODEL='medium'
LANGUAGE='Japanese'

./whisper-cli "$MOVIE" --model $MODEL --language $LANGUAGE --task transcribe --output_format srt
