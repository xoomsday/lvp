Local Video Player is a lightweight, privacy-focused Progressive Web App
(PWA) designed for one thing: playing your local video files without any
fuss. It runs entirely in your browser, works completely offline, and
never uploads or tracks your data. Your files and your playlists stay on
your machine, always.

There are two ways to get started:

1.  **Try it Now (Recommended):** A live version is hosted at
    **[here](https://xoomsday.github.io/lvp/LocalVideoPlayer.html)**.
    You can use it immediately. Since it's a PWA, you
    can also 'install' it from your browser to get an icon on your
    desktop or home screen for a fast, app-like experience.

2.  **Host it Yourself:** This repository contains the complete source.
    The live version above is served directly from these files. You can
    download them and run them from any local or remote web server you
    choose, giving you full control.

We believe in transparency. The application is 100% client-side. The
only time it connects to the internet is to download the core
application files (the same HTML, CSS, and JavaScript you see here).
Your videos and playlists are never transmitted over the network.
Whether you use the hosted version or run it yourself, your data remains
private.

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
    *   **Selecting Videos:**
        *   **Mouse:** Click an item to select it. Ctrl-click to add or
            remove an item from the selection. Shift-click to select a
            range of items.
        *   **Keyboard:** Use the `ArrowUp` and `ArrowDown` keys to move a
            focus cursor. Press `Space` to toggle the selection status
            of the focused item. Use `Shift+ArrowUp` or `Shift+ArrowDown`
            to extend the selection.
    *   **Reordering Videos:** Click and hold on a selected video, then
        drag it to a new position in the playlist. If you drag one
        selected item, all other selected items will be moved with it.
    *   **Play (▶):** Starts playing the currently focused video
        (indicated by a blue outline).
    *   **Save (💾):** Saves the selected videos to the browser's
        internal storage (IndexedDB). Saved videos will be automatically
        loaded the next time you open the app.
    *   **Remove (🗑):** Remove all selected videos from the playlist.
        If a video has been saved, it will also be removed from the
        browser's storage.

3.  **Video Playback:**
    *   To play a video, first ensure it is focused (it will have a
        blue outline). You can use the mouse or arrow keys to change
        focus.
    *   Then, either click the main Play button (▶) at the top of the
        playlist or press the `v` key.
    *   The application will switch to the video player view. When you
        return to the playlist, the item you were just watching will be
        focused.

## Keyboard Shortcuts

### Playlist View

*   `o`: Open file chooser to add videos.
*   `s`: Save selected files to the browser's internal storage.
*   `x`: Remove selected videos.
*   `v`: Switch to the video player view.
*   `ArrowUp` / `ArrowDown`: Move the focus cursor up or down.
*   `Shift+ArrowUp` / `Shift+ArrowDown`: Extend the selection.
*   `Ctrl+ArrowUp` / `Ctrl+ArrowDown`: Move selected item(s) up or down.
*   `Ctrl+a`: Select all items.
*   `Escape`: Clear selection.
*   `Space`: Toggle selection for the focused item.

*   `?`: Toggle help modal (works in any view).

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
*   `q`: Stop playback and return to the playlist view.
*   `o`: Open file chooser to add more videos.
