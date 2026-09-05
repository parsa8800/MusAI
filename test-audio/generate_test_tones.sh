#!/bin/bash
# Generate synthetic test tones for pitch detection testing
# These pure sine waves will be perfect for testing pitch detection accuracy

# Function to generate a note
generate_note() {
  local note_name=$1
  local midi_note=$2
  local frequency=$3
  local duration=${4:-3}
  
  echo "Generating $note_name (MIDI $midi_note, ${frequency}Hz)..."
  
  ffmpeg -f lavfi -i "sine=frequency=${frequency}:duration=${duration}" \
    -af "afade=t=in:st=0:d=0.1,afade=t=out:st=$((duration-1)):d=0.5" \
    -ar 44100 -ac 1 -y "synthetic_${note_name}_${midi_note}.wav" 2>/dev/null
}

# Generate common violin notes for testing
# A4 = 440 Hz (standard tuning reference) - MIDI 69
generate_note "A4" 69 440.00

# G4 = 392 Hz - MIDI 67
generate_note "G4" 67 392.00

# D5 = 587.33 Hz - MIDI 74
generate_note "D5" 74 587.33

# E4 = 329.63 Hz - MIDI 64 (open E string)
generate_note "E4" 64 329.63

# A5 = 880 Hz - MIDI 81
generate_note "A5" 81 880.00

# C5 = 523.25 Hz - MIDI 72
generate_note "C5" 72 523.25

echo "Generated synthetic test tones!"
ls -lh synthetic_*.wav
