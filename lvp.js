var videoPlay;
var videoPane;
var playList;
var playListPane;
var speedLabel;
var loopLabel;
var timeLabel;
var aspectLabel;
var sizeLabel;
var hideControlsTimeout;
var willEndAtTime;
var refocus;
var scrollInterval;
var current_playlist_name = "default";
var currentMarks = [];

function add_video_refocus_listeners() {
    videoPlay.addEventListener('play', refocus);
    videoPlay.addEventListener('pause', refocus);
    videoPlay.addEventListener('seeked', refocus);
    videoPlay.addEventListener('volumechange', refocus);
}

function remove_video_refocus_listeners() {
    videoPlay.removeEventListener('play', refocus);
    videoPlay.removeEventListener('pause', refocus);
    videoPlay.removeEventListener('seeked', refocus);
    videoPlay.removeEventListener('volumechange', refocus);
}

function resetHideControlsTimer() {
    videoPlay.classList.remove('hide-controls');
    clearTimeout(hideControlsTimeout);
    var timeout = videoPlay.paused ? 5000 : 2000;
    hideControlsTimeout = setTimeout(function() {
        videoPlay.classList.add('hide-controls');
    }, timeout);
}

async function verify_permission(fileHandle) {
    const options = { mode: 'read' };
    if (await fileHandle.queryPermission(options) === 'granted') {
        return true;
    }
    if (await fileHandle.requestPermission(options) === 'granted') {
        return true;
    }
    return false;
}

async function open_files() {
    if (!lvp_db) {
        console.error("Database not initialized, cannot open files.");
        return;
    }
    try {
        const handles = await window.showOpenFilePicker({
            multiple: true,
            types: [{
                description: 'Videos',
                accept: {
                    'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm']
                }
            }]
        });

        if (!handles || !handles.length)
            return;

        const was_empty = playList.childNodes.length == 0;

        var transaction = lvp_db.transaction(["file_handles", "playlist"], "readwrite");
        var store = transaction.objectStore("file_handles");
        var playlist_store = transaction.objectStore("playlist");

        const new_ids = new Array(handles.length);
        const put_promises = handles.map((handle, index) => {
            return new Promise((resolve, reject) => {
                const request = store.put({
                    "handle": handle,
                    "last_played_time": null,
                    "last_playback_position": 0,
                    "marks": []
                });
                request.onsuccess = function(e) {
                    new_ids[index] = e.target.result;
                    resolve();
                }
                request.onerror = reject;
            });
        });

        await Promise.all(put_promises);

        // Compute new playlist files
        var playlist_files = [];
        var focus_id = null;
        for (var d of playList.childNodes) {
            if (d.classList.contains('focused')) {
                focus_id = d.myId;
            }
            playlist_files.push({ "id": d.myId, "type": d.myType });
        }

        for (const id of new_ids) {
            playlist_files.push({ "id": id, "type": "handle" });
        }

        playlist_store.put({
            "name": current_playlist_name,
            "files": playlist_files,
            "focus": focus_id
        });

        transaction.oncomplete = async function() {
            for (let i = 0; i < handles.length; i++) {
                await add_to_playlist(handles[i], false, new_ids[i], "handle");
            }
            adjust_tool_visibility();

            if (was_empty && playList.childNodes.length > 0) {
                focused_item = playList.firstChild;
                focused_item.classList.add('focused');
                save_playlist(current_playlist_name);
            }
        };

    } catch (e) {
        console.log(e);
    }
}

async function refresh_playlist_selector() {
    const selector = document.getElementById("playlistSelect");
    const playlists = await get_all_playlists();

    playlists.sort();

    selector.innerHTML = "";
    for (const name of playlists) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        if (name === current_playlist_name) {
            option.selected = true;
        }
        selector.appendChild(option);
    }

    selector.style.display = (playlists.length <= 1) ? "none" : "inline-block";

    document.getElementById("playlistDeleteBtn").disabled = (current_playlist_name === "default");
    document.getElementById("playlistRenameBtn").disabled = (current_playlist_name === "default");
}

async function load_playlist_by_name(name) {
    if (!lvp_db) return;

    playList.innerHTML = "";
    focused_item = null;
    last_clicked_item = null;

    const playlist = await new Promise((resolve, reject) => {
        var transaction = lvp_db.transaction(["playlist"], "readonly");
        var store = transaction.objectStore("playlist");
        var request = store.get(name);
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e);
    });

    if (playlist && playlist.files) {
        const promises = playlist.files.map(item => {
            return add_to_playlist_by_id(item.type, item.id);
        });
        await Promise.all(promises);

        if (playlist.focus) {
            var d = find_playlist_item_by_id(playlist.focus);
            if (d) {
                focused_item = d;
                focused_item.classList.add('focused');
            }
        }
        if (!focused_item && playList.childNodes.length > 0) {
            focused_item = playList.firstChild;
            focused_item.classList.add('focused');
        }
    }

    current_playlist_name = name;
    localStorage.setItem("last_playlist", name);
    await refresh_playlist_selector();
    adjust_tool_visibility();
}

async function on_playlist_change() {
    const selector = document.getElementById("playlistSelect");
    const name = selector.value;
    if (name !== current_playlist_name) {
        save_current_playback_info();
        save_playlist(current_playlist_name);
        await load_playlist_by_name(name);
    }
}

async function playlist_new() {
    let name = prompt("Enter name for the new playlist:");
    if (!name) return;
    name = name.trim();
    if (!name) return;

    const playlists = await get_all_playlists();
    if (playlists.includes(name)) {
        alert("A playlist with this name already exists.");
        return;
    }

    save_current_playback_info();
    save_playlist(current_playlist_name);

    current_playlist_name = name;
    playList.innerHTML = "";
    focused_item = null;
    last_clicked_item = null;

    save_playlist(current_playlist_name);
    localStorage.setItem("last_playlist", name);
    await refresh_playlist_selector();
    adjust_tool_visibility();
}

async function playlist_rename() {
    if (current_playlist_name === "default") return;

    let newName = prompt("Enter new name for the playlist:", current_playlist_name);
    if (!newName) return;
    newName = newName.trim();
    if (!newName || newName === current_playlist_name) return;

    const playlists = await get_all_playlists();
    if (playlists.includes(newName)) {
        alert("A playlist with this name already exists.");
        return;
    }

    const oldName = current_playlist_name;
    var transaction = lvp_db.transaction(["playlist"], "readwrite");
    var store = transaction.objectStore("playlist");
    var get_request = store.get(oldName);

    get_request.onsuccess = function(e) {
        var playlistData = e.target.result;
        if (playlistData) {
            playlistData.name = newName;
            store.put(playlistData);
            store.delete(oldName);
        }
    };

    transaction.oncomplete = async function() {
        current_playlist_name = newName;
        localStorage.setItem("last_playlist", newName);
        await refresh_playlist_selector();
    };
}


async function playlist_delete() {
    if (current_playlist_name === "default") return;

    if (!confirm(`Are you sure you want to delete the playlist "${current_playlist_name}"?`)) {
        return;
    }

    delete_playlist_from_db(current_playlist_name);
    await load_playlist_by_name("default");
}

async function playlist_move() {
    var to_move = [];
    var children = Array.from(playList.childNodes);
    for (var i = 0; i < children.length; i++) {
        var d = children[i];
        if (d.classList.contains('selected')) {
            to_move.push(d);
        }
    }

    if (to_move.length === 0) return;

    const playlists = await get_all_playlists();
    const otherPlaylists = playlists.filter(name => name !== current_playlist_name);

    if (otherPlaylists.length === 0) {
        alert("Create another playlist first to move videos.");
        return;
    }

    let targetName = prompt("Move to playlist:\n" + otherPlaylists.join("\n"), otherPlaylists[0]);
    if (!targetName) return;
    targetName = targetName.trim();
    if (!playlists.includes(targetName) || targetName === current_playlist_name) {
        alert("Invalid playlist name.");
        return;
    }

    // Atomic Transaction for moving items
    var transaction = lvp_db.transaction(["playlist"], "readwrite");
    var store = transaction.objectStore("playlist");

    var get_request = store.get(targetName);
    get_request.onsuccess = function(e) {
        var targetPlaylistData = e.target.result || { name: targetName, files: [] };
        for (var d of to_move) {
            targetPlaylistData.files.push({ id: d.myId, type: d.myType });
        }
        store.put(targetPlaylistData);

        // Now update current playlist
        var playlist_files = [];
        var focus_id = null;
        for (var d of playList.childNodes) {
            if (!to_move.includes(d)) {
                if (d.classList.contains('focused')) {
                    focus_id = d.myId;
                }
                playlist_files.push({ "id": d.myId, "type": d.myType });
            }
        }
        store.put({
            "name": current_playlist_name,
            "files": playlist_files,
            "focus": focus_id
        });
    };

    transaction.oncomplete = function() {
        // Remove from current playlist UI
        for (var d of to_move) {
            if (d === focused_item) {
                focused_item = null;
            }
            if (d === last_clicked_item) {
                last_clicked_item = null;
            }
            playList.removeChild(d);
        }
        adjust_tool_visibility();
    };
}

async function initialize_all() {
    videoPlay = document.getElementById("video");
    videoPane = document.getElementById("videopane");
    playList = document.getElementById("playlist");
    playListPane = document.getElementById("playlistpane");
    speedLabel = document.getElementById("speedLabel");
    loopLabel = document.getElementById("loopLabel");
    abLabel = document.getElementById("abLabel");
    timeLabel = document.getElementById("timeLabel");
    aspectLabel = document.getElementById("aspectLabel");
    sizeLabel = document.getElementById("sizeLabel");

    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('sw.js');
            console.log('Service Worker Registered');
        } catch (error) {
            console.log('Service Worker Registration Failed');
        }
    }

    try {
        await initialize_db();

        const allPlaylists = await get_all_playlists();
        if (allPlaylists.includes("current") && !allPlaylists.includes("default")) {
            const currentData = await new Promise((resolve) => {
                var transaction = lvp_db.transaction(["playlist"], "readonly");
                var store = transaction.objectStore("playlist");
                var request = store.get("current");
                request.onsuccess = (e) => resolve(e.target.result);
            });
            if (currentData) {
                currentData.name = "default";
                await new Promise((resolve) => {
                    var transaction = lvp_db.transaction(["playlist"], "readwrite");
                    var store = transaction.objectStore("playlist");
                    store.put(currentData);
                    store.delete("current");
                    transaction.oncomplete = resolve;
                });
            }
        }

        if (!(await get_all_playlists()).includes("default")) {
            await save_playlist("default");
        }

        current_playlist_name = localStorage.getItem("last_playlist") || "default";
        await refresh_playlist_selector();
        await load_playlist_by_name(current_playlist_name);
    } catch (e) {
        console.error("Failed to initialize database or load playlist:", e);
    }

    adjust_tool_visibility();
    setApplicationTitle("");

    videoPlay.style.objectFit = 'contain';
    videoPlay.addEventListener('ended', async function(e) {
        if (videoPlay.myPlaying) {
            var d = videoPlay.myPlaying;
            update_video_playback_info(d.myId, d.myType, Date.now(), 0);
            d.myLastPlayed.textContent = "Last played: " + new Date().toLocaleString();
        }
        if (await play_next(1) < 0)
            showVideoPane(false);
    });

    window.addEventListener('keydown', function(e) {
        if (document.activeElement === videoPlay &&
            (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            e.preventDefault();
        }
    }, true);

    videoPlay.addEventListener('keydown', function(e) {
        videoPlayKey(e);
    });

    videoPlay.addEventListener('pause', save_current_playback_info);

    videoPlay.addEventListener('timeupdate', e => {
        timeupdate();
    });

    videoPlay.addEventListener('loadedmetadata', function(e) {
        setAspectSizeInfo();
    });

    playListPane.addEventListener('keydown', function(e) {
        playListKey(e);
    });

    // Auto-scrolling for drag and drop
    playListPane.addEventListener('dragover', function(e) {
        e.preventDefault();
        const rect = playListPane.getBoundingClientRect();
        const scrollThreshold = 50; // Pixels from the edge to start scrolling
        const scrollSpeed = 10;    // Pixels per animation frame

        if (e.clientY < rect.top + scrollThreshold) {
            // Scroll up
            if (!scrollInterval) {
                scrollInterval = requestAnimationFrame(function scrollUp() {
                    playListPane.scrollTop -= scrollSpeed;
                    scrollInterval = requestAnimationFrame(scrollUp);
                });
            }
        } else if (e.clientY > rect.bottom - scrollThreshold) {
            // Scroll down
            if (!scrollInterval) {
                scrollInterval = requestAnimationFrame(function scrollDown() {
                    playListPane.scrollTop += scrollSpeed;
                    scrollInterval = requestAnimationFrame(scrollDown);
                });
            }
        } else {
            // Stop scrolling if not near edges
            if (scrollInterval) {
                cancelAnimationFrame(scrollInterval);
                scrollInterval = null;
            }
        }
    });

    playListPane.addEventListener('dragleave', function() {
        if (scrollInterval) {
            cancelAnimationFrame(scrollInterval);
            scrollInterval = null;
        }
    });

    playListPane.addEventListener('drop', function() {
        if (scrollInterval) {
            cancelAnimationFrame(scrollInterval);
            scrollInterval = null;
        }
    });

    videoPlay.addEventListener('mousemove', resetHideControlsTimer);
    videoPlay.addEventListener('play', resetHideControlsTimer);
    videoPlay.addEventListener('pause', resetHideControlsTimer);

    refocus = function(e) {
        videoPlay.focus();
    };
    add_video_refocus_listeners();

    window.addEventListener('resize', function(e) {
        setVideoPlaySize();
    });

    showVideoPane(false);
}

function pretty_filesize(size) {
    const kilo = 1024;
    var scale = 1;
    var unit = ['bytes', 'KB', 'MB', 'GB'];

    while (1 < unit.length && scale * kilo < size) {
        scale = scale * kilo;
        unit.shift();
    }
    size = Number.parseFloat(size / scale).toFixed(2);
    return `${size}${unit[0]}`
}

function add_to_playlist_by_id(type, id) {
    return new Promise((resolve, reject) => {
        var store_name = (type == "video") ? "videos" : "file_handles";
        var transaction = lvp_db.transaction([store_name], "readonly");
        var store = transaction.objectStore(store_name);
        var request = store.get(id);

        request.onsuccess = async function(e) {
            var record = e.target.result;
            if (!record) {
                resolve();
                return;
            }

            if (record.file) {
                add_to_playlist(record.file, true, id, type);
                resolve();
            } else {
                add_to_playlist(record.handle, false, id, type);
                resolve();
            }
        };

        request.onerror = function(e) {
            reject(e);
        };
    });
}

function find_playlist_item_by_id(id) {
    for (var child of playList.childNodes) {
        if (child.myId == id) {
            return child;
        }
    }
    return null;
}

async function add_to_playlist(file, is_saved, id, type) {
    var d = document.createElement('div');
    playList.appendChild(d);
    d.draggable = true;
    d.addEventListener('click', e => {
        playlist_item_clicked(e);
    });
    d.addEventListener('dragstart', e => {
        // If the dragged item isn't selected, clear selection and select it.
        if (!d.classList.contains('selected')) {
            for (var child of playList.childNodes) {
                child.classList.remove('selected');
            }
            d.classList.add('selected');
        }

        var selected_ids = [];
        for (var child of playList.childNodes) {
            if (child.classList.contains('selected')) {
                selected_ids.push(child.myId);
                child.classList.add('dragging');
            }
        }
        e.dataTransfer.setData('text/plain', JSON.stringify(selected_ids));
    });
    d.addEventListener('dragend', e => {
        for (var child of playList.childNodes) {
            child.classList.remove('dragging');
        }
    });
    d.addEventListener('dragover', e => {
        e.preventDefault();
        d.classList.add('dragover');
    });
    d.addEventListener('dragleave', e => {
        d.classList.remove('dragover');
    });
    d.addEventListener('drop', e => {
        e.preventDefault();
        d.classList.remove('dragover');

        const selected_items = Array.from(playList.querySelectorAll('.selected'));
        if (selected_items.length === 0) return;

        if (selected_items.includes(d)) {
            return;
        }

        const fragment = document.createDocumentFragment();
        for (const item of selected_items) {
            fragment.appendChild(item);
        }

        const rect = d.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;

        if (e.clientY < midpoint) {
            playList.insertBefore(fragment, d);
        } else {
            playList.insertBefore(fragment, d.nextSibling);
        }

        save_playlist(current_playlist_name);
    });
    var saving = document.createElement('div');
    saving.setAttribute("class", "saving");
    if (is_saved)
        saving.textContent = '✅';

    var name = document.createElement('div');
    var filename = pretty_filename(file.name);
    var filesize;

    if (file.kind) {
        filesize = file.kind;
        d.myHandle = file;
    } else {
        filesize = pretty_filesize(file.size);
        d.myFile = file;
    }

    name.setAttribute("class", "filename");
    name.textContent = `${filename} (${filesize})`;

    var last_played_el = document.createElement('div');
    last_played_el.setAttribute("class", "last-played");
    const playback_info = await get_video_playback_info(id, type);
    if (playback_info.last_played_time) {
        last_played_el.textContent = "Last played: " + new Date(playback_info.last_played_time).toLocaleString();
    } else {
        last_played_el.textContent = "Not played yet";
    }

    d.appendChild(saving);
    d.appendChild(name);
    d.appendChild(last_played_el);
    d.mySaving = saving;
    d.myName = name;
    d.myLastPlayed = last_played_el;
    d.myId = id;
    d.myType = type;
}

var last_clicked_item = null;
var focused_item = null;
var last_removed_index = -1;

function playlist_item_clicked(e) {
    var clicked_item = e.currentTarget;
    var was_something_focused = (focused_item !== null);

    // First, manage focus
    if (focused_item) {
        focused_item.classList.remove('focused');
    }
    clicked_item.classList.add('focused');
    focused_item = clicked_item;
    last_removed_index = -1;
    save_playlist(current_playlist_name);

    if (!was_something_focused) {
        last_clicked_item = clicked_item;
        return;
    }

    // Next, manage selection
    if (e.shiftKey && last_clicked_item) {
        var children = Array.from(playList.childNodes);
        var start = children.indexOf(last_clicked_item);
        var end = children.indexOf(clicked_item);

        if (start > end) {
            [start, end] = [end, start];
        }

        // Deselect everything first for a clean selection range
        for (var item of playList.childNodes) {
            item.classList.remove('selected');
        }

        for (var i = start; i <= end; i++) {
            children[i].classList.add('selected');
        }
    } else if (e.ctrlKey) {
        clicked_item.classList.toggle('selected');
        last_clicked_item = clicked_item;
    } else {
        for (var child of playList.childNodes) {
            if (clicked_item === child) {
                clicked_item.classList.toggle('selected');
            } else {
                child.classList.remove('selected');
            }
        }
        last_clicked_item = clicked_item;
    }
}

function get_all_keys(store) {
    return new Promise((resolve, reject) => {
        const request = store.getAllKeys();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function resurrect_orphaned_items() {
    if (!lvp_db)
        return;

    const transaction = lvp_db.transaction(["videos", "file_handles", "playlist"], "readonly");
    const videos_store = transaction.objectStore("videos");
    const handles_store = transaction.objectStore("file_handles");
    const playlist_store = transaction.objectStore("playlist");

    const all_video_keys = await get_all_keys(videos_store);
    const all_handle_keys = await get_all_keys(handles_store);

    const playlist_req = playlist_store.get(current_playlist_name);
    playlist_req.onsuccess = async function(e) {
        const playlist = e.target.result;
        const referenced_video_ids = new Set();
        const referenced_handle_ids = new Set();

        if (playlist && playlist.files) {
            for (const file of playlist.files) {
                if (file.type === 'video') {
                    referenced_video_ids.add(file.id);
                } else { // 'handle'
                    referenced_handle_ids.add(file.id);
                }
            }
        }

        const orphaned_video_keys = all_video_keys.filter(id => !referenced_video_ids.has(id));
        for (const id of orphaned_video_keys) {
            await add_to_playlist_by_id("video", id);
        }

        const orphaned_handle_keys = all_handle_keys.filter(id => !referenced_handle_ids.has(id));
        for (const id of orphaned_handle_keys) {
            await add_to_playlist_by_id("handle", id);
        }
    };
}

async function playlist_remove(e) {
    var to_remove = [];
    var children = Array.from(playList.childNodes);
    var first_removed_index = -1;

    for (var i = 0; i < children.length; i++) {
        var d = children[i];
        if (d.classList.contains('selected')) {
            to_remove.push(d);
            if (first_removed_index === -1) {
                first_removed_index = i;
            }
        }
    }

    if (to_remove.length === 0) return;

    // Phase 1: DB Transaction
    var transaction = lvp_db.transaction(["videos", "file_handles", "playlist"], "readwrite");
    var videos_store = transaction.objectStore("videos");
    var handles_store = transaction.objectStore("file_handles");
    var playlist_store = transaction.objectStore("playlist");

    for (var d of to_remove) {
        var store = (d.myType == "video") ? videos_store : handles_store;
        store.delete(d.myId);
    }

    // Compute new playlist
    var playlist_files = [];
    var focus_id = null;
    for (var d of playList.childNodes) {
        if (!to_remove.includes(d)) {
            if (d.classList.contains('focused')) {
                focus_id = d.myId;
            }
            playlist_files.push({ "id": d.myId, "type": d.myType });
        }
    }

    playlist_store.put({
        "name": current_playlist_name,
        "files": playlist_files,
        "focus": focus_id
    });

    transaction.oncomplete = async function() {
        for (var d of to_remove) {
            if (d === focused_item) {
                focused_item = null;
            }
            playList.removeChild(d);
            if (videoPlay.myPlaying === d) {
                videoPlay.pause();
                videoPlay.removeAttribute('src');
                videoPlay.load();
                videoPlay.myPlaying = null;
            }
        }

        if (focused_item === null) {
            last_removed_index = first_removed_index;
        }

        if (playList.childNodes.length == 0)
            await resurrect_orphaned_items();

        adjust_tool_visibility();
    };
}

function adjust_tool_visibility() {
    var tools = document.getElementById('tools');
    var new_visibility =
        (playList.childNodes.length == 0) ? 'hidden' : 'visible';
    for (var tool of tools.childNodes) {
        if (tool.classList && !tool.classList.contains('alwaysshown'))
            tool.style.visibility = new_visibility;
    }
}

function find_next(offset) {
    var l = playList.childNodes.length;
    for (var i in playList.childNodes) {
        if (videoPlay.myPlaying === playList.childNodes[i]) {
            var current = parseInt(i);
            var next = (parseInt(i) + offset + l) % l;

            if (!videoPlay.myLoop && current + offset != next)
                return -1;
            return next;
        }
    }
    return -1;
}

async function play_next(offset) {
    var at = find_next(offset);
    if (0 <= at)
        await play_through(at, false);
    return at;
}

function pretty_filename(filename) {
    return filename.replace(/\.[a-z0-9]+$/, "");
}

function showVideoPane(please) {
    if (please) {
        playListPane.style.display = "none";
        videoPane.style.display = "block";
        videoPlay.focus();
    } else {
        playListPane.style.display = "block";
        videoPane.style.display = "none";
        if (document.fullscreenElement)
            document.exitFullscreen();
        playListPane.focus();
    }
}

async function play_through(at, continue_playing) {
    save_current_playback_info();
    willEndAtTime = false;
    if (at < 0)
        at = find_next(0);
    if (at < 0)
        at = 0;
    if (!playList.childNodes.length || playList.childNodes.length <= at) {
        showVideoPane(false);
        return;
    } else {
        showVideoPane(true);
    }

    var d = playList.childNodes[at];
    await setPlaying(d, continue_playing);

    playListPane.style.display = "none";
    videoPane.style.display = "block";
    setVideoPlaySize();
    add_video_refocus_listeners();
    videoPlay.play();
    show_info();
}

function setApplicationTitle(title) {
    var titleElement = document.getElementById("documentTitle");
    if (title == "")
        title = "Local Video Player";
    titleElement.textContent = title;
}

async function ensure_file_access(item) {
    if (item.myHandle) {
        const hasPermission = await verify_permission(item.myHandle);
        if (hasPermission) {
            item.myFile = await item.myHandle.getFile();
            item.myHandle = null;
        } else {
            console.log(`Permission denied for file handle: ${item.myHandle.name}`);
            return false;
        }
    }
    return item.myFile != null;
}

async function setPlaying(d, continue_playing) {
    if (!await ensure_file_access(d))
        return;

    var unchanged = (videoPlay.myPlaying == d);
    if (!unchanged) {
        var lastSpeed = videoPlay.playbackRate;
        videoPlay.myPlaying = d;
        videoPlay.setAttribute('src', URL.createObjectURL(d.myFile));
        videoPlay.playbackRate = lastSpeed;

        currentMarks = [];
        get_video_marks(d.myId, d.myType).then(marks => {
            currentMarks = marks || [];
        });

        if (continue_playing) {
            const playback_info = await get_video_playback_info(d.myId, d.myType);
            if (playback_info.last_playback_position > 0) {
                videoPlay.currentTime = playback_info.last_playback_position;
            }
        }
    }
    update_video_playback_info(d.myId, d.myType, Date.now(), videoPlay.currentTime);
    setApplicationTitle(pretty_filename(d.myFile.name));
}

function save_current_playback_info() {
    if (videoPlay.myPlaying) {
        var d = videoPlay.myPlaying;
        update_video_playback_info(d.myId, d.myType, Date.now(), videoPlay.currentTime);
        d.myLastPlayed.textContent = "Last played: " + new Date().toLocaleString();
    }
}

function unshow_all() {
    for (var e of document.getElementsByClassName("labelstring"))
        e.style.visibility = "hidden";
}

function show_all() {
    for (var e of document.getElementsByClassName("labelstring"))
        e.style.visibility = "visible";
}

function show_hidden(where, clearTime) {
    if (clearTime < where.myClearTime)
        return;
    unshow_all();
}

function show_briefly(where, timeout) {
    show_all();
    where.myClearTime = Date.now() + timeout;
    setTimeout(show_hidden, timeout, where, where.myClearTime);
}

function set_notification(where, text) {
    where.textContent = text;
    show_briefly(where, 5000);
}

function setVideoPlaySize() {
    var width = window.innerWidth;
    var height = window.innerHeight;
    videoPlay.width = width;
    videoPlay.height = height;

    setAspectSizeInfo();
}

function showPlaybackRate() {
    var text = videoPlay.playbackRate.toFixed(2);
    set_notification(speedLabel, "Speed: " + text);
    willEndAtTime = undefined;
}

function showLoop() {
    var text = videoPlay.myLoop ? "Loop" : "No Loop";
    set_notification(loopLabel, text);
}

function showABLabel(text) {
    set_notification(abLabel, text);
}

function showTitle() {
    var d = videoPlay.myPlaying;
    set_notification(titleLabel, pretty_filename(d.myFile.name));
}

function showTime() {
    show_briefly(timeLabel, 5000);
}

function crt(a, b) {
    var x = a;
    var y = b;
    while (b) {
        var t = b;
        b = a % b;
        a = t;
    }
    x = x / a;
    y = y / a;
    return [x, y];
}

function ratio_string(a, b) {
    if (!a || !b)
        return "";

    const fuzz = [0, -1, +1, -2, +2, -3, +3, -4, +4, -5, +5];
    var bestxy = null;

    for (var xf of fuzz) {
        for (var yf of fuzz) {
            var xy = crt(a + xf, b + yf);
            var diff;

            if (32 <= (xy[0] + xy[1]))
                continue;

            diff = Math.abs(a / b - xy[0] / xy[1]);

            if (bestxy == null ||
                diff < Math.abs(a / b - bestxy[0] / bestxy[1]))
                bestxy = xy;
        }
    }

    if (bestxy)
        return `${bestxy[0]}:${bestxy[1]}`;
    else
        return `${a}:${b}`;
}

function setAspectSizeInfo() {
    var ratio = ratio_string(videoPlay.videoWidth, videoPlay.videoHeight);

    if (videoPlay.style.objectFit == 'contain') {
        var w = videoPlay.width;
        var h = videoPlay.height;
        var W = videoPlay.videoWidth;
        var H = videoPlay.videoHeight;

        if (w * H < W * h) {
            /* 
             * That is, "w / h < W / H", meaning that the container
             * width is narrower than it needs to be to show the video
             * at the full height.  We'd be using full container width
             * but not full height.
             */
            h = Math.round(w * H / W);
        } else {
            /* The other way around */
            w = Math.round(h * W / H);
        }
        aspectLabel.textContent = `contain (aspect) ${w} × ${h}`;
    } else if (videoPlay.style.objectFit == 'none') {
        aspectLabel.textContent = 'none (1-to-1)';
    } else {
        var w = videoPlay.width;
        var h = videoPlay.height;
        aspectLabel.textContent = `fill (stretch) ${w} × ${h}`;
    }

    sizeLabel.textContent =
        `${videoPlay.videoWidth} × ${videoPlay.videoHeight} (${ratio})`;
}

function showAspect() {
    show_briefly(aspectLabel, 5000);
}

function showSize() {
    show_briefly(sizeLabel, 5000);
}

function show_info() {
    showPlaybackRate();
    showLoop();
    showTitle();
    showTime();
    showAspect();
    showSize();

    if (currentMarks && currentMarks.length > 0) {
        const marksStr = currentMarks.map(m => toHHMMSS(m)).join(', ');
        showABLabel("Marks: " + marksStr);
    } else {
        showABLabel("");
    }
}

function toggle_info() {
    showing = false;
    for (var e of document.getElementsByClassName("labelstring"))
        if (e.style.visibility == "visible")
            showing = true;
    if (showing)
        unshow_all();
    else {
        show_all();
    }
}

function toggleFullScreenVideo() {
    videoPane.requestFullscreen().then(setVideoPlaySize);
}

function toHHMMSS (sec_num) {

    sec_num     = Math.floor(sec_num);

    var hours   = Math.floor(sec_num / 3600);
    var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    var seconds = sec_num - (hours * 3600) - (minutes * 60);

    if (hours   < 10) {hours   = "0"+hours;}
    if (minutes < 10) {minutes = "0"+minutes;}
    if (seconds < 10) {seconds = "0"+seconds;}

    if (hours == "00") {
        return minutes + ':' + seconds;
    }
    return hours+':'+minutes+':'+seconds;
}

function timeupdate() {
    if (videoPlay.readyState < 4) {
        timeLabel.textContent = '';
    } else {
        const time = videoPlay.currentTime;

        if (videoPlay.myLoop) {
            const nextMark = currentMarks.find(m => m > time + 0.1) || videoPlay.duration;
            // Check if we are very close to or past the next mark
            // Using a small buffer (0.2s) to prevent skipping over the mark
            if (time >= nextMark - 0.2) {
                const sorted = [...currentMarks].sort((a, b) => a - b);
                let prev = 0;
                for (let i = sorted.length - 1; i >= 0; i--) {
                    if (sorted[i] < nextMark - 0.5) {
                        prev = sorted[i];
                        break;
                    }
                }
                videoPlay.currentTime = prev;
                showABLabel(`Looping: ${toHHMMSS(prev)} - ${toHHMMSS(nextMark)}`);
                return; // Exit to avoid updating label with old time
            }
        }

        var current = toHHMMSS(time);
        var total = toHHMMSS(videoPlay.duration);
        var remaining = ((videoPlay.duration - videoPlay.currentTime) /
                         videoPlay.playbackRate);

        if (willEndAtTime === undefined) {
            var dt = new Date();
            var hhmmss = (dt.getHours() * 60 + dt.getMinutes()) * 60 + dt.getSeconds();
            willEndAtTime = toHHMMSS(hhmmss + remaining);
        }
        remaining = toHHMMSS(remaining);
        timeLabel.textContent =
            `${current} / ${total} (${remaining} / ${willEndAtTime})`;
    }
}

function toggleAspect() {
    /* C -> F -> N -> C -> F -> ... */
    if (videoPlay.style.objectFit == 'contain')
        videoPlay.style.objectFit = 'fill';
    else if (videoPlay.style.objectFit == 'none')
        videoPlay.style.objectFit = 'contain';
    else
        videoPlay.style.objectFit = 'none';
    setAspectSizeInfo();
    showAspect();
}

function toggleLoop() {
    videoPlay.myLoop = videoPlay.myLoop ? false : true;
    showLoop();
}

async function play_from_focus() {
    if (focused_item) {
        var children = Array.from(playList.childNodes);
        var index = children.indexOf(focused_item);
        await play_through(index, true);
    } else if (playList.childNodes.length > 0) {
        await play_through(0, true);
    }
}

function move_selection(direction) {
    const selected_items = Array.from(playList.querySelectorAll('.selected'));
    if (selected_items.length === 0) return;

    let insertion_point = null;

    if (direction === 'down') {
        const last = selected_items[selected_items.length - 1];
        const target = last.nextSibling;
        if (target) {
            insertion_point = target.nextSibling;
        } else {
            return; // Already at the bottom
        }
    } else { // 'up'
        const first = selected_items[0];
        const target = first.previousSibling;
        if (target) {
            insertion_point = target;
        } else {
            return; // Already at the top
        }
    }

    for (const item of selected_items) {
        playList.insertBefore(item, insertion_point);
    }

    save_playlist(current_playlist_name);
}

async function playListKey(e) {
    // Handle keys that should work regardless of playlist content
    switch (e.key) {
    case 'a':
        if (e.ctrlKey) {
            e.preventDefault();
            for (var child of playList.childNodes) {
                child.classList.add('selected');
            }
            // Set last_clicked_item to the last item for shift-selection consistency
            if (playList.childNodes.length > 0) {
                last_clicked_item = playList.lastChild;
            }
        }
        return;
    case 'Escape':
        e.preventDefault();
        for (var child of playList.childNodes) {
            child.classList.remove('selected');
        }
        last_clicked_item = null;
        return;
    case 'o':
        open_files();
        return;
    case 's':
        save_selected_files();
        return;
    case 'm':
        playlist_move();
        return;
    case 'x':
        playlist_remove();
        return;
    case 'v':
        await play_from_focus();
        return;
    }

    // The rest of the keys only make sense if there are items in the playlist.
    if (!playList.childNodes.length) {
        return;
    }

    // For navigation and selection, we prevent default browser actions like scrolling.
    var new_focus;
    switch (e.key) {
    case 'ArrowDown':
    case 'ArrowUp':
        e.preventDefault();

        if (e.ctrlKey) {
            const all_items = Array.from(playList.childNodes);
            const selected_items = all_items.filter(item => item.classList.contains('selected'));

            if (selected_items.length === 0) return;

            const first_selected_index = all_items.indexOf(selected_items[0]);
            const last_selected_index = all_items.indexOf(selected_items[selected_items.length - 1]);

            const is_contiguous = (selected_items.length === (last_selected_index - first_selected_index + 1));

            if (e.key === 'ArrowUp') {
                if (!is_contiguous) {
                    // Gather non-contiguous selection upwards
                    const span_items = all_items.slice(first_selected_index, last_selected_index + 1);
                    const non_selected_in_span = span_items.filter(item => !item.classList.contains('selected'));
                    const insertion_point = selected_items[selected_items.length - 1].nextSibling;
                    for (const item of non_selected_in_span) {
                        playList.insertBefore(item, insertion_point);
                    }
                } else {
                    // Move contiguous block upwards
                    const insertion_point = all_items[first_selected_index].previousSibling;
                    if (insertion_point) {
                        const fragment = document.createDocumentFragment();
                        for (const item of selected_items) {
                            fragment.appendChild(item);
                        }
                        playList.insertBefore(fragment, insertion_point);
                    }
                }
            } else { // ArrowDown
                if (!is_contiguous) {
                    // Gather non-contiguous selection downwards
                    const span_items = all_items.slice(first_selected_index, last_selected_index + 1);
                    const non_selected_in_span = span_items.filter(item => !item.classList.contains('selected'));
                    const insertion_point = selected_items[0];
                    for (const item of non_selected_in_span) {
                        playList.insertBefore(item, insertion_point);
                    }
                } else {
                    // Move contiguous block downwards
                    const insertion_point = all_items[last_selected_index].nextSibling;
                    if (insertion_point) {
                        const fragment = document.createDocumentFragment();
                        for (const item of selected_items) {
                            fragment.appendChild(item);
                        }
                        playList.insertBefore(fragment, insertion_point.nextSibling);
                    }
                }
            }
            save_playlist(current_playlist_name);
            return;
        }

        var current_focus = focused_item;
        if (!current_focus) {
            var children = playList.childNodes;
            if (children.length === 0) return;

            if (last_removed_index !== -1) {
                if (e.key === 'ArrowDown') {
                    var idx = Math.min(last_removed_index, children.length - 1);
                    new_focus = children[idx];
                } else { // ArrowUp
                    var idx = Math.max(0, last_removed_index - 1);
                    new_focus = children[idx];
                }
                last_removed_index = -1;
            } else {
                new_focus = playList.firstChild;
            }
        } else {
            if (e.key === 'ArrowDown') {
                new_focus = current_focus.nextSibling || current_focus;
            } else {
                new_focus = current_focus.previousSibling || current_focus;
            }
        }
        if (!e.shiftKey) {
            last_clicked_item = null; // Reset anchor on non-shift move
        }
        break;

    case ' ': // Spacebar
        e.preventDefault();
        if (focused_item) {
            focused_item.classList.toggle('selected');
            last_clicked_item = focused_item;
            last_removed_index = -1;
        }
        return; // No focus change

    default:
        return; // Let all other keys (like Ctrl+W) pass through
    }

    // Handle focus change and shift-selection
    if (new_focus) { // This block only runs if we moved the focus
        if (e.shiftKey) {
            if (!last_clicked_item) {
                last_clicked_item = focused_item || playList.firstChild;
            }

            // Reselect the range from the anchor to the new focus
            var children = Array.from(playList.childNodes);
            var start = children.indexOf(last_clicked_item);
            var end = children.indexOf(new_focus);

            if (start > end) { [start, end] = [end, start]; }

            for (var item of playList.childNodes) {
                item.classList.remove('selected');
            }
            for (var i = start; i <= end; i++) {
                children[i].classList.add('selected');
            }
        }

        if (new_focus !== focused_item) {
            if (focused_item) {
                focused_item.classList.remove('focused');
            }
            new_focus.classList.add('focused');
            focused_item = new_focus;
            last_removed_index = -1;
            focused_item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            save_playlist(current_playlist_name);
        }
    }
}

async function videoPlayKey(e) {
    switch (e.key) {
    case '[':
        if (0.2 <= videoPlay.playbackRate)
            videoPlay.playbackRate -= 0.1;
        showPlaybackRate();
        break;
    case '=':
        videoPlay.playbackRate = 1;
        showPlaybackRate();
        break;
    case ']':
        if (videoPlay.playbackRate < 2.0)
            videoPlay.playbackRate += 0.1;
        showPlaybackRate();
        break;
    case 'ArrowRight':
        videoPlay.currentTime += (e.shiftKey) ? 5 : 30;
        resetHideControlsTimer();
        showTime();
        break;
    case 'ArrowLeft':
        videoPlay.currentTime -= (e.shiftKey) ? 1 : 10;
        resetHideControlsTimer();
        showTime();
        break;
    case 'a':
        toggleAspect();
        break;
    case 'f':
        toggleFullScreenVideo();
        break;
    case 'l':
        toggleLoop();
        break;
    case 'r':
        // Add mark
        const timeAdd = videoPlay.currentTime;
        if (!currentMarks.some(m => Math.abs(m - timeAdd) < 0.1)) {
            currentMarks.push(timeAdd);
            currentMarks.sort((a, b) => a - b);
            update_video_marks(videoPlay.myPlaying.myId, videoPlay.myPlaying.myType, currentMarks);
            showABLabel("Mark Set: " + toHHMMSS(timeAdd));
        }
        break;
    case 'R':
        // Delete mark
        const threshold = 2;
        const timeDel = videoPlay.currentTime;
        let closestIndex = -1;
        let minDiff = Infinity;

        currentMarks.forEach((m, i) => {
            const diff = Math.abs(m - timeDel);
            if (diff < minDiff && diff < threshold) {
                minDiff = diff;
                closestIndex = i;
            }
        });

        if (closestIndex !== -1) {
            currentMarks.splice(closestIndex, 1);
            update_video_marks(videoPlay.myPlaying.myId, videoPlay.myPlaying.myType, currentMarks);
            showABLabel("Mark Deleted");
        }
        break;
    case 'n':
        await play_next(1);
        break;
    case 'N':
        const timeNext = videoPlay.currentTime;
        const next = currentMarks.find(m => m > timeNext + 0.1);
        if (next !== undefined) {
            videoPlay.currentTime = next;
            showABLabel("Jump to: " + toHHMMSS(next));
        }
        break;
    case 'o':
        open_files();
        break;
    case 'p':
        await play_next(-1);
        break;
    case 'P':
        const timePrev = videoPlay.currentTime;
        const sorted = [...currentMarks].sort((a, b) => a - b);
        let prev = 0;
        for (let i = sorted.length - 1; i >= 0; i--) {
            if (sorted[i] < timePrev - 2) {
                prev = sorted[i];
                break;
            } else if (sorted[i] < timePrev - 0.1) {
                // If very close to current mark, go to the one before it
                prev = (i > 0) ? sorted[i-1] : 0;
                break;
            }
        }
        videoPlay.currentTime = prev;
        showABLabel("Jump to: " + toHHMMSS(prev));
        break;
    case '.':
        if (videoPlay.paused)
            toggle_info();
        else
            show_info();
        break;
    case 'q':
        save_current_playback_info();
        if (focused_item) {
            focused_item.classList.remove('focused');
        }
        focused_item = videoPlay.myPlaying;
        if (focused_item) {
            focused_item.classList.add('focused');
        }
        remove_video_refocus_listeners();
        videoPlay.pause();
        showVideoPane(false);
        setApplicationTitle("");
        save_playlist(current_playlist_name);
        break;
    default:
        break;
    }
}

function toggle_help_modal(force_hide) {
    const modal = document.getElementById('help-modal');
    const is_visible = modal.classList.contains('is-visible');

    if (force_hide || is_visible) {
        modal.classList.remove('is-visible');
    } else {
        const is_video_mode = videoPane.style.display !== 'none';
        document.getElementById('playlist-shortcuts').style.display = is_video_mode ? 'none' : 'block';
        document.getElementById('video-shortcuts').style.display = is_video_mode ? 'block' : 'none';
        modal.classList.add('is-visible');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    initialize_all();

    const modal = document.getElementById('help-modal');
    const close_button = document.querySelector('.close-button');

    close_button.addEventListener('click', () => toggle_help_modal(true));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            toggle_help_modal(true);
        }
    });
});


window.addEventListener('beforeunload', () => {
    save_current_playback_info();
    save_playlist(current_playlist_name);
});

document.addEventListener('keydown', (e) => {
    if (e.key === '?') {
        toggle_help_modal();
    }
});
