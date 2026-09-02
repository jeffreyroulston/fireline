//! Process memory release hooks for long-running searches.

#[cfg(target_os = "linux")]
pub(crate) fn release_process_memory() {
    unsafe {
        libc_malloc_trim(0);
    }
}

#[cfg(target_os = "linux")]
unsafe extern "C" {
    #[link_name = "malloc_trim"]
    fn libc_malloc_trim(pad: usize) -> i32;
}

#[cfg(not(target_os = "linux"))]
pub(crate) fn release_process_memory() {}
