# Test Audio Files for MusAI Development

This directory contains various audio files for testing the pitch detection and intonation analysis features of MusAI.

## 📁 File Categories

### 1. Synthetic Pure Tones (`synthetic_*.wav`)
Pure sine wave tones at exact frequencies - perfect for testing pitch detection accuracy.

- **synthetic_A4_69.wav** - 440 Hz (standard tuning reference)
- **synthetic_G4_67.wav** - 392 Hz
- **synthetic_E4_64.wav** - 329.63 Hz (open E string)
- **synthetic_D5_74.wav** - 587.33 Hz
- **synthetic_C5_72.wav** - 523.25 Hz
- **synthetic_A5_81.wav** - 880 Hz

**Use case:** Testing pitch detection algorithm accuracy with perfect, noise-free input.

### 2. Violin-Like Tones with Harmonics (`violin_like_*.wav`)
Synthetic tones with realistic harmonic content and subtle vibrato, simulating violin timbre.

- **violin_like_A4_69.wav** - A4 with harmonics
- **violin_like_E4_64.wav** - E4 with harmonics
- **violin_like_D5_74.wav** - D5 with harmonics
- **violin_like_G4_67.wav** - G4 with harmonics

**Use case:** Testing with more realistic instrument characteristics while maintaining clean pitch.

### 3. Real Violin Samples (`real_violin_samples/`)
Physically modeled violin samples from the Free Violin Synth Sample Kit (GitHub).

Sample files include notes from G3 to D#6 (MIDI 55-87):
- 055_G3.wav through 087_D#6.wav
- 15+ different notes across the violin range
- 48kHz, 16-bit stereo WAV files

**Use case:** Testing with realistic violin recordings including natural attack, sustain, and release characteristics.

## 🎯 Recommended Testing Workflow

1. **Start with synthetic tones** - Verify your pitch detection is working correctly
2. **Test with violin-like harmonics** - Ensure algorithm handles overtones properly
3. **Validate with real samples** - Confirm it works with actual instrument recordings

## 🎵 MIDI Note Reference

Common violin notes:
- E4 (MIDI 64) - Open E string, ~329.63 Hz
- A4 (MIDI 69) - Open A string, 440 Hz (standard tuning)
- D5 (MIDI 74) - Open D string (one octave up), ~587.33 Hz
- G4 (MIDI 67) - ~392 Hz

## 📝 Licensing

- **Synthetic tones** - Generated for this project, public domain
- **Violin-like tones** - Generated for this project, public domain
- **Real violin samples** - From [Free Violin Synth Sample Kit](https://github.com/GareBear99/Free-Violin-Synth-Sample-Kit), free to use

## 🔧 Regenerating Test Files

To regenerate synthetic files:
```bash
./generate_test_tones.sh
./generate_realistic_tones_v2.sh
```
