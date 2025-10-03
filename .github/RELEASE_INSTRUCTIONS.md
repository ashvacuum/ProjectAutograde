# Unity Auto-Grader - Installation Instructions

## Download the Right Version

- **Windows**: Download the `.exe` or folder from `windows-latest-build`
- **macOS**: Download the `.dmg` from `macos-latest-build`
- **Linux**: Download the `.AppImage` from `ubuntu-latest-build`

## Installation

### Windows
1. Extract the downloaded folder if needed
2. Run the executable file
3. If Windows Defender warns you, click "More info" → "Run anyway"

### macOS
1. Open the `.dmg` file
2. Drag the app to your Applications folder
3. If macOS blocks it (unidentified developer):
   - Go to System Preferences → Security & Privacy
   - Click "Open Anyway"

### Linux
1. Make the `.AppImage` executable: `chmod +x Unity-Auto-Grader-*.AppImage`
2. Run it: `./Unity-Auto-Grader-*.AppImage`

## First Time Setup

1. Launch the application
2. Go to Settings
3. Configure your Canvas API token and URL
4. Set up your Unity installation path

## Requirements

- Unity 2020.3 or later (for grading Unity projects)
- Canvas LMS account with API access
- Internet connection for Canvas integration

## Troubleshooting

- **App won't open**: Check that you've followed the platform-specific installation steps above
- **Canvas connection fails**: Verify your API token and Canvas URL in Settings
- **Unity projects not detected**: Ensure Unity is installed and path is set correctly in Settings

For issues and support, visit: https://github.com/yourusername/unity-auto-grader/issues
