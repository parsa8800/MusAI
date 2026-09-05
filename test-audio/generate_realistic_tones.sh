#!/bin/bash
# Generate more realistic violin-like tones with harmonics and slight vibrato

generate_realistic_violin() {
  local note_name=$1
  local midi_note=$2
  local frequency=$3
  local duration=4
  
  echo "Generating realistic $note_name (MIDI $midi_note, ${frequency}Hz)..."
  
  # Generate a tone with harmonics (fundamental + overtones) and slight vibrato
  # Violin has strong odd harmonics
  ffmpeg -f lavfi -i "
    sine=f=${frequency}:d=${duration}[a0];
    sine=f=$((frequency*2)):d=${duration}[a1];
    sine=f=$((frequency*3)):d=${duration}[a2];
    sine=f=$((frequency*4)):d=${duration}[a3];
    sine=f=$((frequency*5)):d=${duration}[a4];
    [a0][a1]amix=inputs=2:weights=1.0 0.4[b0];
    [b0][a2]amix=inputs=2:weights=1.0 0.25[b1];
    [b1][a3]amix=inputs=2:weights=1.0 0.15[b2];
    [b2][a4]amix=inputs=2:weights=1.0 0.1[out]
  " -map "[out]" \
    -af "afade=t=in:st=0:d=0.2,afade=t=out:st=3.5:d=0.5,vibrato=f=6:d=0.3" \
    -ar 44100 -ac 1 -y "violin_like_${note_name}_${midi_note}.wav" 2>/dev/null
}

# Generate notes with rich harmonics
generate_realistic_violin "A4" 69 440.00
generate_realistic_violin "E4" 64 329.63
generate_realistic_violin "D5" 74 587.33

echo ""
echo "Generated realistic violin-like tones!"
ls -lh violin_like_*.wav
