# Quick Start Guide: Using Test Audio Files with MusAI

## 🎯 How to Use These Files

### Method 1: Upload to the Web App

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Open http://localhost:3000

3. In Step 1: Choose your target pitch (e.g., select A4 - MIDI 69)

4. In Step 2: Click "Upload" mode

5. Click "Choose an audio file" and select a test file:
   - Start with: `test-audio/synthetic_A4_69.wav` (matches A4 target)
   - Or try: `test-audio/violin_like_A4_69.wav` (more realistic)
   - Or use: `test-audio/real_violin_samples/069_A4.wav` (actual violin)

6. Click "Analyze intonation" to see the results!

### Method 2: Direct File Testing

Copy a test file to your desktop or downloads folder for easy access:

```bash
# Copy a synthetic tone to your desktop (macOS example)
cp test-audio/synthetic_A4_69.wav ~/Desktop/

# Or copy a real sample
cp test-audio/real_violin_samples/069_A4.wav ~/Desktop/test_violin.wav
```

## 🧪 Recommended Test Scenarios

### Test 1: Perfect Pitch (Should score 100%)
- **Target**: A4 (MIDI 69)
- **File**: `synthetic_A4_69.wav`
- **Expected**: "In tune" with ~100 score

### Test 2: Slightly Sharp
- **Target**: A4 (MIDI 69)
- **File**: `synthetic_A5_81.wav` (one octave up - 880Hz)
- **Expected**: System should detect A5, not A4

### Test 3: Realistic Violin Tone
- **Target**: A4 (MIDI 69)
- **File**: `real_violin_samples/069_A4.wav`
- **Expected**: Should handle harmonics and natural timbre

### Test 4: Different Note Detection
- **Target**: D5 (MIDI 74)
- **File**: `violin_like_D5_74.wav`
- **Expected**: Should correctly identify D5

### Test 5: Scale Practice Testing
For the scale practice feature (`/practice/scale`):
- Use multiple files in sequence
- Test with: E4, G4, A4, C5, D5 samples
- Validates multi-note analysis

## 📊 File Selection Guide

| Use Case | Recommended Files | Why |
|----------|------------------|-----|
| Algorithm validation | `synthetic_*.wav` | Perfect pitch, no noise |
| Harmonic handling | `violin_like_*.wav` | Realistic overtones |
| Production testing | `real_violin_samples/*.wav` | Real-world conditions |
| UI/UX testing | Any file | Test user workflows |

## 🎵 MIDI Note Quick Reference

When selecting target pitch in the app:

| File Name | MIDI Note | Frequency | Violin String |
|-----------|-----------|-----------|---------------|
| synthetic_E4_64.wav | 64 | 329.63 Hz | Open E string |
| synthetic_G4_67.wav | 67 | 392.00 Hz | Open G string |
| synthetic_A4_69.wav | 69 | 440.00 Hz | Open A string (tuning reference) |
| synthetic_D5_74.wav | 74 | 587.33 Hz | Open D string (octave up) |

## 🔧 Regenerating Files

If you need to regenerate test files:

```bash
cd test-audio

# Generate synthetic pure tones
./generate_test_tones.sh

# Generate violin-like tones with harmonics
./generate_realistic_tones_v2.sh
```

Download fresh real samples (requires internet):
```bash
# The script downloads from GitHub
# Already done, but can be re-run if needed
```

## 💡 Pro Tips

1. **Start simple**: Test with `synthetic_A4_69.wav` first to verify basic pitch detection
2. **Test edge cases**: Try files that are slightly off-pitch or in different octaves
3. **Mix and match**: Use different file types to test robustness
4. **Scale testing**: Create a sequence of notes for scale practice testing
5. **Performance**: Synthetic files are smaller and faster to process

## 🐛 Troubleshooting

**Problem**: "No clear pitch was found"
- **Solution**: Make sure target note matches the file's actual pitch

**Problem**: Wrong note detected
- **Solution**: Check if file is in a different octave (e.g., A4 vs A5)

**Problem**: Files not showing in upload dialog
- **Solution**: Ensure you're in the test-audio directory or copy files to an accessible location

## 📝 Next Steps

After validating with test files:
- Test with actual violin recordings when available
- Use test files for automated testing
- Share test results to validate algorithm improvements
