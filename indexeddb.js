var lvp_db;

function initialize_db() {
    return new Promise((resolve, reject) => {
        var request = window.indexedDB.open("lvp_db", 2);

        request.onupgradeneeded = function(e) {
            var db = e.target.result;
            if (e.oldVersion < 1) {
                db.createObjectStore("videos", { keyPath: "id", autoIncrement: true });
                db.createObjectStore("file_handles", { keyPath: "id", autoIncrement: true });
                db.createObjectStore("playlist", { keyPath: "name" });
            }
            if (e.oldVersion < 2) {
                var transaction = e.target.transaction;
                var stores = ["videos", "file_handles"];

                for (const storeName of stores) {
                    var store = transaction.objectStore(storeName);
                    store.openCursor().onsuccess = function(event) {
                        var cursor = event.target.result;
                        if (cursor) {
                            var record = cursor.value;
                            if (!record.last_played_time) {
                                record.last_played_time = null;
                            }
                            if (!record.last_playback_position) {
                                record.last_playback_position = 0;
                            }
                            cursor.update(record);
                            cursor.continue();
                        }
                    };
                }
            }
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

    var items_to_save = [];
    for (var d of playList.childNodes) {
        if (d.classList.contains('selected') && d.mySaving.textContent != '✅') {
            items_to_save.push(d);
        }
    }

    if (items_to_save.length === 0)
        return;

    // Phase 1: Preparation (async operations outside transaction)
    for (var d of items_to_save) {
        d.mySaving.textContent = '⏳';
        if (!await ensure_file_access(d) || !d.myFile) {
            d.mySaving.textContent = '❗';
        }
    }

    var ready_items = items_to_save.filter(d => d.mySaving.textContent === '⏳');
    if (ready_items.length === 0)
        return;

    // Phase 2: Atomic Transaction
    var transaction = lvp_db.transaction(["videos", "file_handles", "playlist"], "readwrite");
    var videos_store = transaction.objectStore("videos");
    var handles_store = transaction.objectStore("file_handles");
    var playlist_store = transaction.objectStore("playlist");

    var promotion_promises = ready_items.map(playlist_item => {
        return new Promise((resolve, reject) => {
            var put_request = videos_store.put({
                "name": playlist_item.myFile.name,
                "file": playlist_item.myFile,
                "last_played_time": null,
                "last_playback_position": 0,
                "marks": playlist_item.myMarks || []
            });
            put_request.onsuccess = function(e) {
                var new_id = e.target.result;
                handles_store.delete(playlist_item.myId);
                playlist_item.newId = new_id;
                resolve();
            };
            put_request.onerror = reject;
        });
    });

    try {
        await Promise.all(promotion_promises);

        // Update playlist in the SAME transaction
        var playlist_files = [];
        var focus_id = null;
        for (var d of playList.childNodes) {
            var id = (d.newId !== undefined) ? d.newId : d.myId;
            var type = (d.newId !== undefined) ? "video" : d.myType;
            if (d.classList.contains('focused')) {
                focus_id = id;
            }
            playlist_files.push({ "id": id, "type": type });
        }

        playlist_store.put({
            "name": current_playlist_name,
            "files": playlist_files,
            "focus": focus_id
        });

        transaction.oncomplete = function() {
            var refresh_transaction = lvp_db.transaction(["videos"], "readonly");
            var refresh_store = refresh_transaction.objectStore("videos");

            for (var d of ready_items) {
                d.myId = d.newId;
                d.myType = "video";
                delete d.newId;
                var filename = pretty_filename(d.myFile.name);
                var filesize = pretty_filesize(d.myFile.size);
                d.myName.textContent = `${filename} (${filesize})`;

                (function(item) {
                    var get_request = refresh_store.get(item.myId);
                    get_request.onsuccess = function(e) {
                        if (e.target.result) {
                            item.myFile = e.target.result.file;
                            item.myHandle = null;
                        }
                    };
                })(d);
            }

            refresh_transaction.oncomplete = function() {
                for (var d of ready_items) {
                    d.mySaving.textContent = '✅';
                }
            };
        };
    } catch (e) {
        transaction.abort();
        for (var d of ready_items) {
            d.mySaving.textContent = '❗';
        }
    }
}

function save_playlist(name) {
    return new Promise((resolve, reject) => {
        if (!lvp_db || !name) {
            resolve();
            return;
        }

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
        store.put({ "name": name, "files": playlist_files, "focus": focus_id });

        transaction.oncomplete = function() {
            resolve();
        };

        transaction.onerror = function(e) {
            console.log("Failed to save playlist");
            reject(e);
        };
    });
}

function delete_playlist_from_db(name) {
    if (!lvp_db || !name || name === "default")
        return;

    var transaction = lvp_db.transaction(["playlist"], "readwrite");
    var store = transaction.objectStore("playlist");
    store.delete(name);
}

async function get_all_playlists() {
    if (!lvp_db)
        return [];

    return new Promise((resolve, reject) => {
        var transaction = lvp_db.transaction(["playlist"], "readonly");
        var store = transaction.objectStore("playlist");
        var request = store.getAllKeys();
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e);
    });
}

function remove_from_db(id, type) {
    if (!lvp_db)
        return;

    var store_name = (type == "video") ? "videos" : "file_handles";
    var transaction = lvp_db.transaction([store_name], "readwrite");
    var store = transaction.objectStore(store_name);
    store.delete(id);
}



function update_video_playback_info(id, type, last_played_time, last_playback_position) {
    if (!lvp_db || !id)
        return;

    var store_name = (type == "video") ? "videos" : "file_handles";
    var transaction = lvp_db.transaction([store_name], "readwrite");
    var store = transaction.objectStore(store_name);

    var request = store.get(id);

    request.onsuccess = function(e) {
        var video = e.target.result;
        if (video) {
            video.last_played_time = last_played_time;
            video.last_playback_position = last_playback_position;
            store.put(video);
        }
    };

    request.onerror = function(e) {
        console.log("Failed to update video playback info:" + e.target.error);
    };
}

async function get_video_playback_info(id, type) {
    if (!lvp_db || !id)
        return { last_played_time: null, last_playback_position: 0 };

    return new Promise((resolve, reject) => {
        var store_name = (type == "video") ? "videos" : "file_handles";
        var transaction = lvp_db.transaction([store_name], "readonly");
        var store = transaction.objectStore(store_name);
        var request = store.get(id);

        request.onsuccess = function(e) {
            var video = e.target.result;
            if (video) {
                resolve({
                    last_played_time: video.last_played_time,
                    last_playback_position: video.last_playback_position
                });
            } else {
                resolve({ last_played_time: null, last_playback_position: 0 });
            }
        };

        request.onerror = function(e) {
            console.log("Failed to get video playback info:" + e.target.error);
            resolve({ last_played_time: null, last_playback_position: 0 });
        };
    });
}

function update_video_marks(id, type, marks) {
    if (!lvp_db || !id)
        return;

    var store_name = (type == "video") ? "videos" : "file_handles";
    var transaction = lvp_db.transaction([store_name], "readwrite");
    var store = transaction.objectStore(store_name);

    var request = store.get(id);

    request.onsuccess = function(e) {
        var video = e.target.result;
        if (video) {
            video.marks = marks;
            store.put(video);
        }
    };

    request.onerror = function(e) {
        console.log("Failed to update video marks:" + e.target.error);
    };
}

async function get_video_marks(id, type) {
    if (!lvp_db || !id)
        return [];

    return new Promise((resolve, reject) => {
        var store_name = (type == "video") ? "videos" : "file_handles";
        var transaction = lvp_db.transaction([store_name], "readonly");
        var store = transaction.objectStore(store_name);
        var request = store.get(id);

        request.onsuccess = function(e) {
            var video = e.target.result;
            if (video) {
                resolve(video.marks || []);
            } else {
                resolve([]);
            }
        };

        request.onerror = function(e) {
            console.log("Failed to get video marks:" + e.target.error);
            resolve([]);
        };
    });
}
