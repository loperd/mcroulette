"""Build the project's gateway from its pinned shared source, without vendoring it."""
import argparse
import json
import pathlib
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="Local checkout of the shared gateway")
    parser.add_argument("--tag", help="Override the image tag for a registry build")
    args = parser.parse_args()
    profile = json.loads(pathlib.Path(__file__).with_name("gateway-source.json").read_text())
    commit = profile["commit"]
    resolved = subprocess.check_output(
        ["git", "-C", args.source, "rev-parse", commit + "^{commit}"], text=True,
    ).strip()
    if resolved != commit:
        raise SystemExit("Gateway source must resolve to the pinned commit")
    # Archive committed files only; local changes, credentials and .git stay out.
    archive = subprocess.check_output(["git", "-C", args.source, "archive", commit])
    subprocess.run(
        ["docker", "build", "--build-arg", "COMMIT_SHA=" + commit,
         "--tag", args.tag or profile["image"], "-"],
        input=archive, check=True,
    )


if __name__ == "__main__":
    main()
