use crate::{files, Shared};
use std::{
    fs,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
fn fixture() -> PathBuf {
    let p = std::env::temp_dir().join(format!(
        "lumius-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&p).unwrap();
    p
}
#[test]
fn trash_and_restore_real_file() {
    let root = fixture();
    let file = root.join("restore-me.txt");
    fs::write(&file, b"restore these bytes").unwrap();
    trash::delete(&file).unwrap();
    assert!(!file.exists());
    let items = files::trash_list().unwrap();
    let item = items
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["original"].as_str() == file.to_str())
        .unwrap();
    let id = item["id"].as_str().unwrap();
    fs::write(&file, b"existing").unwrap();
    assert!(files::restore(id).is_err());
    assert_eq!(fs::read(&file).unwrap(), b"existing");
    fs::remove_file(&file).unwrap();
    files::restore(id).unwrap();
    assert_eq!(fs::read(&file).unwrap(), b"restore these bytes");
    fs::remove_dir_all(root).unwrap();
}
fn complete(state: &Shared, id: &str) -> serde_json::Value {
    let start = Instant::now();
    loop {
        let t = state.transfers.lock().unwrap().get(id).unwrap().clone();
        if t["state"] != "running" {
            return t;
        }
        assert!(start.elapsed() < Duration::from_secs(10));
        std::thread::sleep(Duration::from_millis(10))
    }
}
#[test]
fn copy_move_and_conflict_preserve_bytes() {
    let root = fixture();
    let src = root.join("source");
    let dst = root.join("destination");
    fs::create_dir(&src).unwrap();
    fs::create_dir(&dst).unwrap();
    fs::write(src.join("notes.txt"), b"real filesystem data").unwrap();
    let state = Arc::new(Shared::default());
    let id = files::transfer(
        state.clone(),
        src.to_str().unwrap(),
        dst.to_str().unwrap(),
        false,
    )
    .unwrap();
    assert_eq!(complete(&state, id.as_str().unwrap())["state"], "complete");
    assert_eq!(
        fs::read(dst.join("source/notes.txt")).unwrap(),
        b"real filesystem data"
    );
    assert!(src.exists());
    assert!(files::transfer(
        state.clone(),
        src.to_str().unwrap(),
        dst.to_str().unwrap(),
        false
    )
    .is_err());
    assert!(files::transfer(
        state.clone(),
        src.to_str().unwrap(),
        src.to_str().unwrap(),
        false
    )
    .is_err());
    fs::write(root.join("move.txt"), b"move").unwrap();
    let id = files::transfer(
        state.clone(),
        root.join("move.txt").to_str().unwrap(),
        dst.to_str().unwrap(),
        true,
    )
    .unwrap();
    assert_eq!(complete(&state, id.as_str().unwrap())["state"], "complete");
    assert!(!root.join("move.txt").exists());
    assert_eq!(fs::read(dst.join("move.txt")).unwrap(), b"move");
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn archive_traversal_rejected_without_output() {
    use std::io::Write;
    let root = fixture();
    let path = root.join("bad.zip");
    let mut archive = zip::ZipWriter::new(fs::File::create(&path).unwrap());
    archive
        .start_file("../escape.txt", zip::write::SimpleFileOptions::default())
        .unwrap();
    archive.write_all(b"escape").unwrap();
    archive.finish().unwrap();
    assert!(files::extract(path.to_str().unwrap()).is_err());
    assert!(!root.join("escape.txt").exists());
    assert!(!root.join("bad.extracted").exists());
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn valid_archive_and_preview() {
    use std::io::Write;
    let root = fixture();
    let path = root.join("good.zip");
    let mut archive = zip::ZipWriter::new(fs::File::create(&path).unwrap());
    archive
        .start_file("folder/hello.txt", zip::write::SimpleFileOptions::default())
        .unwrap();
    archive.write_all(b"Hello Lumius").unwrap();
    archive.finish().unwrap();
    files::extract(path.to_str().unwrap()).unwrap();
    let preview = files::preview(
        root.join("good.extracted/folder/hello.txt")
            .to_str()
            .unwrap(),
    )
    .unwrap();
    assert_eq!(preview["text"], "Hello Lumius");
    assert!(files::extract(path.to_str().unwrap()).is_err());
    fs::remove_dir_all(root).unwrap();
}
#[cfg(target_os = "linux")]
#[test]
fn symlink_transfer_is_refused() {
    let root = fixture();
    fs::write(root.join("target"), b"target").unwrap();
    std::os::unix::fs::symlink(root.join("target"), root.join("link")).unwrap();
    let dest = root.join("dest");
    fs::create_dir(&dest).unwrap();
    assert!(files::transfer(
        Arc::new(Shared::default()),
        root.join("link").to_str().unwrap(),
        dest.to_str().unwrap(),
        false
    )
    .is_err());
    fs::remove_dir_all(root).unwrap();
}
