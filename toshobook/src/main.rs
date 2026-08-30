use clap::Parser;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Args {
    // Name of the file to open
    #[arg(short, long)]
    file: Option<String>,
}

fn main() {
    let args = Args::parse();
    println!("file: {}", args.file.expect("file not declared"));
}
