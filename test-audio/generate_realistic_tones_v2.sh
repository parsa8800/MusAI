#!/bin/bash
# Generate more realistic violin-like tones with harmonics

generate_realistic_violin() {
  local note_name=$1
  local midi_note=$2
  local f0=$3
  local duration=4
  
  echo "Generating realistic $note_name (MIDI $midi_note, ${f0}Hz)..."
  
  # Calculate harmonics using awk
  local f1=$(awk "BEGIN {printf \"%.2f\", $f0 * 2}")
  local f2=$(awk "BEGIN {printf \"%.2f\", $f0 * 3}")
  local f3=$(awk "BEGIN {printf \"%.2f\", $f0 * 4}")
  
  # Generate with harmonics and vibrato
  ffmpeg -f lavfi \
    -i "sine=f=${f0}:d=${duration}" \
    -f lavfi \
    -i "sine=f=${f1}:d=${duration}" \
    -f lavfi \
    -i "sine=f=${f2}:d=${duration}" \
    -f lavfi \
    -i "sine=f=${f3}:d=${duration}" \
    -filter_complex "[0:a]volume=1.0[a0];[1:a]volume=0.4[a1];[2:a]volume=0.2[a2];[3:a]volume=0.1[a3];[a0][a1][a2][a3]amix=inputs=4[mixed];[mixed]afade=t=in:st=0:d=0.2,afade=t=out:st=3.5:d=0.5,vibrato=f=5.5:d=0.4[out]" \
    -map "[out]" -ar 44100 -ac 1 -y "violin_like_${note_name}_${midi_note}.wav" 2>/dev/null
}

# Generate realistic notes
generate_realistic_violin "A4" 69 440
generate_realistic_violin "E4" 64 329.63
generate_realistic_violin "D5" 74 587.33
generate_realistic_violin "G4" 67 392

echo ""
echo "Generated realistic violin-like tones!"
ls -lh violin_like_*.wav
