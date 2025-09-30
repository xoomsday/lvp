# Local Video Player

A simple, offline-first Progressive Web App (PWA) for playing local video files.

## Features

*   **Playlist Management:** Add multiple files, select, reorder, and remove them.
*   **Keyboard Controls:** Full control over playback without needing the mouse.
*   **Playback Options:** Adjust playback speed, aspect ratio, and looping.
*   **Auto-hiding Controls:** The video progress bar and controls fade away when not in use.
*   **PWA:** Installable on your device for a native-like experience and offline access.

## How to Use

1.  **Adding Videos:**
    *   Click the folder icon (📁) to open the file chooser and select one or more video files.
    *   The selected videos will be added to the playlist.

2.  **Playlist Management:**
    *   **Select Videos:** Click the checkbox next to a video to select it.
    *   **Select All/None (❎):** Toggles the selection of all videos in the playlist.
    *   **Play (▶):** Starts playing the selected video, or the first video if none is selected.
    *   **Save (💾):** Saves the selected videos to the browser's internal storage (IndexedDB). Saved videos will be automatically loaded the next time you open the app.
    *   **Move Up (🔺) / Down (🔻):** Move selected videos up or down in the playlist.
    *   **Remove (🗑):** Remove selected videos from the playlist. If a video has been saved, it will also be removed from the browser's storage.

3.  **Video Playback:**
    *   Click on the '🎵' icon next to a video in the playlist to start playing it.
    *   The application will switch to the video player view.

## Keyboard Shortcuts

### Playlist View

*   `o`: Open file chooser to add videos.
*   `c`: Select all or none of the videos.
*   `x`: Remove selected videos.
*   `v`: Switch to the video player view.

### Video Player View

**Playback**
*   `Space`: Play / Pause.
*   `ArrowLeft`: Seek backward by 10 seconds.
*   `ArrowRight`: Seek forward by 30 seconds.
*   `ArrowUp`: Increase volume.
*   `ArrowDown`: Decrease volume.
*   `m`: Mute / Unmute.
*   `l`: Toggle looping for the current video.
*   `n`: Play the next video in the playlist.
*   `p`: Play the previous video in the playlist.

**Speed**
*   `[`: Decrease playback speed by 0.1.
*   `]`: Increase playback speed by 0.1.
*   `=`: Reset playback speed to 1.0.

**Display**
*   `a`: Toggle aspect ratio (contain, fill, none).
*   `f`: Toggle fullscreen mode.
*   `.`: Show/hide video information overlays.

**General**
*   `v`: Switch back to the playlist view.
*   `q`: Stop playback and return to the playlist view.
*   `o`: Open file chooser to add more videos.
