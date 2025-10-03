# Changelog

All notable changes to AraLaro will be documented in this file.

## [Unreleased]

### Changed
- Rebranded from Unity Auto-Grader to AraLaro
- Updated color theme with new palette:
  - Deep Purple (#6d28d9) - creativity + intelligence
  - Vibrant Teal (#14b8a6) - innovation + accuracy
  - Dark Slate (#1e293b) - professionalism
  - Lime Green (#84cc16) - success/correct code
  - Coral (#f97316) - warnings/errors
  - Gold (#fbbf24) - achievements

## [1.0.6] - 2025-10-03

### Changed
- Updated Windows build to generate NSIS installer and ZIP archive
- Improved distribution format for easier deployment

## [1.0.5] - 2025-10-03

### Fixed
- Added contents write permission to workflow

## [1.0.4] - 2025-10-03

### Fixed
- Removed Linux build from workflow, Windows only support

## [1.0.3] - 2025-10-03

### Fixed
- Removed deprecated packages and upgraded electron-builder

## [1.0.2] - 2025-10-03

### Fixed
- Updated workflow to use v4 actions and removed macOS build

## [1.0.1] - 2025-10-03

### Added
- GitHub Actions workflow for automated releases
- Enhanced GitHub URL cleaning with comprehensive path normalization
- Recursive Unity project detection in nested subdirectories
- Improved GitHub URL cleaning and Unity project detection
- Option to skip already-graded submissions in batch grading
