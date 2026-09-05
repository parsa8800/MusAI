#!/bin/bash
# Try to download real violin samples from various sources

echo "Attempting to download real violin samples..."

# Try University of Iowa Musical Instrument Samples (well-known public source)
echo "Trying University of Iowa samples..."

# These are commonly available violin samples
curl -L -o "real_violin_A4.wav" \
  "http://theremin.music.uiowa.edu/sound%20files/MIS/Strings/violin/Violin.arco.sulA.A3Bb3.stereo.aiff" \
  --max-time 30 --silent --fail 2>/dev/null && echo "✓ Downloaded A3/Bb3 sample" || echo "✗ Failed to download"

curl -L -o "real_violin_D5.wav" \
  "http://theremin.music.uiowa.edu/sound%20files/MIS/Strings/violin/Violin.arco.sulD.D4Eb4.stereo.aiff" \
  --max-time 30 --silent --fail 2>/dev/null && echo "✓ Downloaded D4/Eb4 sample" || echo "✗ Failed to download"

echo ""
echo "Real sample downloads completed (if any succeeded)."
ls -lh real_*.wav 2>/dev/null || echo "No real samples downloaded yet."
