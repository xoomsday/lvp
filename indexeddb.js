
var lvp_db;

function initialize_db(next) {
    var request = window.indexedDB.open("lvp_db", 1);

    request.onupgradeneeded = function(e) {
        var db = e.target.result;
        db.createObjectStore("videos", { keyPath: "name" });
    };

    request.onsuccess = function(e) {
        lvp_db = e.target.result;
        if (next)
            next();
    };
}

function save_selected_files() {
    if (!lvp_db)
        return;

    var transaction = lvp_db.transaction(["videos"], "readwrite");
    var store = transaction.objectStore("videos");

    for (var d of playList.childNodes) {
        if (d.myCheck.checked) {
            store.put({ "name": d.myFile.name, "file": d.myFile });
        }
    }
}

function remove_from_db(filename) {
    if (!lvp_db)
        return;

    var transaction = lvp_db.transaction(["videos"], "readwrite");
    var store = transaction.objectStore("videos");
    store.delete(filename);
}
