use gpu::GpuContext;

#[test]
fn native_gpu_context_can_be_created() {
    match pollster::block_on(GpuContext::new()) {
        Ok(_) => println!("GpuContext::new() succeeded — native GPU access available"),
        Err(e) => panic!("GpuContext::new() failed: {:?}", e),
    }
}
