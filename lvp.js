var fileInput;
var videoPlay;
var videoPane;
var playList;
var playListPane;
var speedLabel;
var loopLabel;
var timeLabel;
var aspectLabel;
var sizeLabel;

function initialize_all() {
    fileInput = document.getElementById("fileInput");
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
        navigator.serviceWorker.register('sw.js').
            then(
                function(registration) {
                    console.log('Service Worker Registered');
                },
                function(error) {
                    console.log('Service Worker Registration Failed');
                },
            );
    }

    setApplicationTitle("");

    videoPlay.style.objectFit = 'contain';
    videoPlay.addEventListener('ended', function(e) {
        if (play_next(1) < 0)
            showVideoPane(false);
    });

    fileInput.addEventListener('change', function(e) {
        for (var file of e.target.files) {
            add_to_playlist(file);
        }
        adjust_tool_visibility();
    });

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

function add_to_playlist(file) {
    var d = document.createElement('div');
    playList.appendChild(d);

    var check = document.createElement('input');
    check.setAttribute("type", "checkbox");

    var selected = document.createElement('div');
    selected.setAttribute("class", "selected");
    selected.appendChild(check);

    var playing = document.createElement('div');
    playing.setAttribute("class", "playing");
    playing.addEventListener('click', e => {
        setPlaying(d);
    });

    var name = document.createElement('div');
    var filename = pretty_filename(file.name);
    var filesize = pretty_filesize(file.size);
    name.setAttribute("class", "filename");
    name.textContent = `${filename} (${filesize})`;

    d.appendChild(selected);
    d.appendChild(playing);
    d.appendChild(name);
    d.myFile = file;
    d.myCheck = check;
    d.myPlaying = playing;
}

function playlist_remove(e) {
    var to_remove = [];
    for (var d of playList.childNodes) {
        if (d.myCheck.checked)
            to_remove.push(d);
    }
    for (var d of to_remove) {
        playList.removeChild(d);
        if (videoPlay.myPlaying === d) {
            videoPlay.pause();
            videoPlay.removeAttribute('src');
            videoPlay.load();
            videoPlay.myPlaying = null;
        }
    }
    adjust_tool_visibility();
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

function select_all_or_none() {
    var new_checked = true;

    if (!playlist.childNodes.length)
        return;

    for (var d of playList.childNodes)
        if (d.myCheck.checked) {
            new_checked = false;
            break;
        }

    for (var d of playList.childNodes)
        d.myCheck.checked = new_checked;
}

function sift_playlist_elements() {
    var us_before = [];
    var us_among = [];
    var us_after = [];
    var selected = [];
    var us_so_far = [];
    for (var d of playList.childNodes) {
        if (!d.myCheck.checked) {
            us_so_far.push(d);
            continue;
        }
        if (!selected.length) {
            us_before = us_so_far;
        } else {
            us_among = us_among.concat(us_so_far);
        }
        us_so_far = [];
        selected.push(d);
    }
    us_after = us_so_far;
    return {
        "us_before": us_before,
        "us_among": us_among,
        "us_after": us_after,
        "selected": selected,
    };
}

function set_new_playlist(n) {
    var to_remove = [];
    for (var d of playList.childNodes)
        to_remove.push(d);
    for (var d of to_remove)
        playList.removeChild(d);
    for (var d of n)
        playList.appendChild(d);
}

function playlist_shift_up(e) {
    var c = sift_playlist_elements();
    var n = [];
    if (!c.selected.length)
        return;
    if (c.us_among.length) {
        n = c.us_before.concat(c.selected, c.us_among, c.us_after);
    } else if (!c.us_before.length) {
        return;
    } else {
        var l = c.us_before.pop();
        n = c.us_before.concat(c.selected, [l], c.us_after);
    }
    set_new_playlist(n);
}

function playlist_shift_down(e) {
    var c = sift_playlist_elements();
    var n = [];
    if (!c.selected.length)
        return;
    if (c.us_among.length) {
        n = c.us_before.concat(c.us_among, c.selected, c.us_after);
    } else if (!c.us_after.length) {
        return;
    } else {
        var l = c.us_after.shift();
        n = c.us_before.concat([l], c.selected, c.us_after);
    }
    set_new_playlist(n);
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

function play_next(offset) {
    var at = find_next(offset);
    if (0 <= at)
        play_through(at);
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
        playListPane.focus();

        if (document.fullscreenElement)
            document.exitFullscreen();
    }
}

function play_through(at, start_paused) {
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
    setPlaying(d);

    playListPane.style.display = "none";
    videoPane.style.display = "block";
    setVideoPlaySize();
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

function setPlaying(d) {
    var unchanged = (videoPlay.myPlaying == d);
    if (!unchanged) {
        var lastSpeed = videoPlay.playbackRate;
        videoPlay.myPlaying = d;
        videoPlay.setAttribute('src', URL.createObjectURL(d.myFile));
        videoPlay.playbackRate = lastSpeed;
    }

    for (var e of playList.childNodes) {
        if (d === e) {
            e.myPlaying.textContent = '🎵';
            setApplicationTitle(pretty_filename(d.myFile.name));
        } else {
            e.myPlaying.textContent = ' ';
        }
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
            if (bestxy == null ||
                ((xy[0] + xy[1]) < 64 &&
                 (xy[0] + xy[1]) < (bestxy[0] + bestxy[1])))
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
        remaining = toHHMMSS(remaining);
        timeLabel.textContent = `${current} / ${total} (${remaining})`;
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

function playListKey(e) {
    switch (e.key) {
    case 'o':
        fileInput.click();
        break;
    case 'c':
        select_all_or_none();
        break;
    case 'x':
        playlist_remove();
        break;
    case 'v':
        if (find_next(0) < 0 || !videoPlay.myPlaying)
            play_through(-1, 1);
        else
            showVideoPane(true);
        break;
    }
}

function videoPlayKey(e) {
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
    case '>':
        videoPlay.currentTime += 15;
        break;
    case '<':
        videoPlay.currentTime -= 5;
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
        play_next(1);
        break;
    case 'o':
        fileInput.click();
        break;
    case 'p':
        play_next(-1);
        break;
    case '.':
        if (videoPlay.paused)
            toggle_info();
        else
            show_info();
        break;
    case 'v':
        showVideoPane(false);
        break;
    case 'q':
        videoPlay.pause();
        showVideoPane(false);
        setApplicationTitle("");
        break;
    default:
        break;
    }
}
