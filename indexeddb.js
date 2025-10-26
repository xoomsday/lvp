var lvp_db;

function initialize_db() {
    return new Promise((resolve, reject) => {
        var request = window.indexedDB.open("lvp_db", 1);

        request.onupgradeneeded = function(e) {
            var db = e.target.result;
            db.createObjectStore("videos", { keyPath: "id", autoIncrement: true });
            db.createObjectStore("file_handles", { keyPath: "id", autoIncrement: true });
            db.createObjectStore("playlist", { keyPath: "name" });
        };

        request.onsuccess = function(e) {
            lvp_db = e.target.result;
            resolve();
        };

        request.onerror = function(e) {
            reject(e);
        };
    });
}

async function save_selected_files() {
    if (!lvp_db)
        return;

    for (var d of playList.childNodes) {
        if (d.classList.contains('selected')) {
            if (d.mySaving.textContent == '✅')
                continue;

            d.mySaving.textContent = '⏳';

            if (!await ensure_file_access(d)) {
                d.mySaving.textContent = '❗';
                continue;
            }

            if (!d.myFile) {
                d.mySaving.textContent = '❗';
                continue;
            }

            (function(playlist_item) {
                var transaction = lvp_db.transaction(["videos", "file_handles"], "readwrite");
                var videos_store = transaction.objectStore("videos");
                var handles_store = transaction.objectStore("file_handles");
                var put_request = videos_store.put({ "name": playlist_item.myFile.name, "file": playlist_item.myFile });

                put_request.onsuccess = function(e) {
                    var new_id = e.target.result;
                    handles_store.delete(playlist_item.myId);
                    playlist_item.myId = new_id;
                    playlist_item.myType = "video";
                    playlist_item.mySaving.textContent = '✅';
                    var filename = pretty_filename(playlist_item.myFile.name);
                    var filesize = pretty_filesize(playlist_item.myFile.size);
                    playlist_item.myName.textContent = `${filename} (${filesize})`;
                    save_playlist();
                };

                put_request.onerror = function(e) {
                    playlist_item.mySaving.textContent = '❗';
                };
            })(d);
        }
    }
}

function save_playlist() {
    if (!lvp_db)
        return;

    var playlist_files = [];
    var focus_id = null;
    for (var d of playList.childNodes) {
        if (d.classList.contains('focused')) {
            focus_id = d.myId;
        }
        playlist_files.push({ "id": d.myId, "type": d.myType });
    }

    var transaction = lvp_db.transaction(["playlist"], "readwrite");
    var store = transaction.objectStore("playlist");
    store.put({ "name": "current", "files": playlist_files, "focus": focus_id });

    transaction.onerror = function(e) {
        console.log("Failed to save playlist");
    };
}

function remove_from_db(id, type) {
    if (!lvp_db)
        return;

    var store_name = (type == "video") ? "videos" : "file_handles";
    var transaction = lvp_db.transaction([store_name], "readwrite");
    var store = transaction.objectStore(store_name);
    store.delete(id);
}
