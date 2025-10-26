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

        var transaction = lvp_db.transaction(["file_handles"], "readwrite");
        var store = transaction.objectStore("file_handles");
        const promises = [];

        for (const handle of handles) {
            const request = store.put({ "handle": handle });
            promises.push(new Promise((resolve, reject) => {
                request.onsuccess = function(e) {
                    add_to_playlist_by_id("handle", e.target.result).then(resolve);
                }
                request.onerror = reject;
            }));
        }

        await Promise.all(promises);
        save_playlist();
        adjust_tool_visibility();

        if (was_empty && playList.childNodes.length > 0) {
            focused_item = playList.firstChild;
            focused_item.classList.add('focused');
        }

    } catch (e) {
        console.log(e);
    }
}

async function initialize_all() {
    videoPlay = document.getElementById("video");
    videoPane = document.getElementById("videopane");
    playList = document.getElementById("playlist");
    playListPane = document.getElementById("playlistpane");
    speedLabel = document.getElementById("speedLabel");
    loopLabel = document.getElementById("loopLabel");
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

    await initialize_db();

    const playlist = await new Promise((resolve, reject) => {
        var transaction = lvp_db.transaction(["playlist"], "readonly");
        var store = transaction.objectStore("playlist");
        var request = store.get("current");
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e);
    });

    if (playlist && playlist.files) {
        const promises = playlist.files.map(item => {
            return add_to_playlist_by_id(item.type, item.id);
        });
        await Promise.all(promises);

        if (playlist.focus) {
            d = find_playlist_item_by_id(playlist.focus);
            focused_item = d;
            focused_item.classList.add('focused');
        } else if (playList.childNodes.length > 0) {
            focused_item = playList.firstChild;
            focused_item.classList.add('focused');
        }
    }

    adjust_tool_visibility();
    setApplicationTitle("");

    videoPlay.style.objectFit = 'contain';
    videoPlay.addEventListener('ended', async function(e) {
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


    videoPlay.addEventListener('timeupdate', e => {
        timeupdate();
    });

    videoPlay.addEventListener('loadedmetadata', function(e) {
        setAspectSizeInfo();
    });

    playListPane.addEventListener('keydown', function(e) {
        playListKey(e);
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

function add_to_playlist(file, is_saved, id, type) {
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

        save_playlist();
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

    d.appendChild(saving);
    d.appendChild(name);
    d.mySaving = saving;
    d.myName = name;
    d.myId = id;
    d.myType = type;
}

var last_clicked_item = null;
var focused_item = null;

function playlist_item_clicked(e) {
    var clicked_item = e.currentTarget;

    // First, manage focus
    if (focused_item) {
        focused_item.classList.remove('focused');
    }
    clicked_item.classList.add('focused');
    focused_item = clicked_item;
    save_playlist();

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
            child.classList.remove('selected');
        }
        clicked_item.classList.add('selected');
        last_clicked_item = clicked_item;
    }
}

function playlist_remove(e) {
    var to_remove = [];
    for (var d of playList.childNodes) {
        if (d.classList.contains('selected'))
            to_remove.push(d);
    }
    for (var d of to_remove) {
        remove_from_db(d.myId, d.myType);
        playList.removeChild(d);
        if (videoPlay.myPlaying === d) {
            videoPlay.pause();
            videoPlay.removeAttribute('src');
            videoPlay.load();
            videoPlay.myPlaying = null;
        }
    }
    adjust_tool_visibility();
    save_playlist();
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
        await play_through(at);
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

async function play_through(at, start_paused) {
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
    await setPlaying(d);

    playListPane.style.display = "none";
    videoPane.style.display = "block";
    setVideoPlaySize();
    add_video_refocus_listeners();
    if (!start_paused)
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

async function setPlaying(d) {
    if (!await ensure_file_access(d))
        return;

    var unchanged = (videoPlay.myPlaying == d);
    if (!unchanged) {
        var lastSpeed = videoPlay.playbackRate;
        videoPlay.myPlaying = d;
        videoPlay.setAttribute('src', URL.createObjectURL(d.myFile));
        videoPlay.playbackRate = lastSpeed;
    }

    setApplicationTitle(pretty_filename(d.myFile.name));
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
        var current = toHHMMSS(videoPlay.currentTime);
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
        await play_through(index, false);
    } else if (playList.childNodes.length > 0) {
        await play_through(0, false);
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

    save_playlist();
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
                    for (const item of non_selected_in_span.reverse()) {
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
            save_playlist();
            return;
        }

        var current_focus = focused_item || playList.firstChild;
        if (e.key === 'ArrowDown') {
            new_focus = current_focus.nextSibling || current_focus;
        } else {
            new_focus = current_focus.previousSibling || current_focus;
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
            save_playlist();
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
    case '>':
        videoPlay.currentTime += 30;
        resetHideControlsTimer();
        showTime();
        break;
    case 'ArrowLeft':
    case '<':
        videoPlay.currentTime -= 10;
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
    case 'n':
        await play_next(1);
        break;
    case 'o':
        open_files();
        break;
    case 'p':
        await play_next(-1);
        break;
    case '.':
        if (videoPlay.paused)
            toggle_info();
        else
            show_info();
        break;
    case 'q':
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
        save_playlist();
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
    save_playlist();
});

document.addEventListener('keydown', (e) => {
    if (e.key === '?') {
        toggle_help_modal();
    }
});
