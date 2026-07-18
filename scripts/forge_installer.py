#!/usr/bin/env python3
"""
Forge Installer Helper using minecraft-launcher-lib
"""

import sys
import os
import json
import argparse

try:
    import minecraft_launcher_lib
except ImportError:
    import subprocess
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "--break-system-packages", "minecraft-launcher-lib"])
        import minecraft_launcher_lib
    except Exception:
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "minecraft-launcher-lib"])
            import minecraft_launcher_lib
        except Exception as e:
            sys.stdout.write(json.dumps({
                "status": "failed",
                "message": f"minecraft-launcher-lib Python library is not installed and auto-installation failed: {e}",
                "progress": 0
            }) + "\n")
            sys.exit(1)


def get_forge_version(mc_version: str):
    """Returns the recommended Forge version for a given Minecraft version."""
    try:
        forge = minecraft_launcher_lib.mod_loader.get_mod_loader("forge")
        if forge.is_minecraft_version_supported(mc_version):
            latest = forge.get_latest_loader_version(mc_version)
            print(json.dumps({"success": True, "version": latest}))
        else:
            print(json.dumps({"success": False, "error": f"Minecraft version {mc_version} does not have a Forge release."}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))


def install_forge(mc_version: str, minecraft_dir: str, forge_version: str = None, java_path: str = None):
    """Installs Forge into the specified custom Minecraft directory using minecraft-launcher-lib mod_loader."""
    max_val = 100
    current_val = 0
    current_status = "Initializing Forge download..."

    def emit_progress():
        progress_pct = int((current_val / max_val * 100)) if max_val > 0 else 0
        progress_pct = max(0, min(100, progress_pct))
        sys.stdout.write(json.dumps({
            "status": "installing",
            "message": current_status,
            "progress": progress_pct
        }) + "\n")
        sys.stdout.flush()

    def set_status(status_str: str):
        nonlocal current_status
        current_status = str(status_str)
        emit_progress()

    def set_progress(val: int):
        nonlocal current_val
        current_val = int(val)
        emit_progress()

    def set_max(m: int):
        nonlocal max_val
        if m > 0:
            max_val = int(m)
        emit_progress()

    callback = {
        "setStatus": set_status,
        "setProgress": set_progress,
        "setMax": set_max
    }

    try:
        forge = minecraft_launcher_lib.mod_loader.get_mod_loader("forge")
        if not forge.is_minecraft_version_supported(mc_version):
            raise ValueError(f"Minecraft version {mc_version} is not supported by Forge")

        os.makedirs(minecraft_dir, exist_ok=True)

        sys.stdout.write(json.dumps({
            "status": "installing",
            "message": f"Installing Forge for Minecraft {mc_version} into custom directory '{minecraft_dir}'...",
            "progress": 5
        }) + "\n")
        sys.stdout.flush()

        loader_ver = forge_version if (forge_version and forge_version != "auto" and forge_version != mc_version) else None

        install_kwargs = {
            "minecraft_version": mc_version,
            "minecraft_directory": minecraft_dir,
            "callback": callback
        }
        if loader_ver:
            install_kwargs["loader_version"] = loader_ver
        if java_path and os.path.exists(java_path):
            install_kwargs["java"] = java_path

        installed_version_id = forge.install(**install_kwargs)

        sys.stdout.write(json.dumps({
            "status": "completed",
            "message": f"Forge {installed_version_id or ''} successfully installed!",
            "progress": 100
        }) + "\n")
        sys.stdout.flush()

    except Exception as e:
        sys.stdout.write(json.dumps({
            "status": "failed",
            "message": f"Forge installation failed: {e}",
            "progress": 0
        }) + "\n")
        sys.stdout.flush()
        sys.exit(1)


def get_launch_command(mc_version: str, minecraft_dir: str, username: str, uuid: str, access_token: str, java_path: str = None):
    try:
        installed = None
        for v in minecraft_launcher_lib.utils.get_installed_versions(minecraft_dir):
            vid = v.get("id", "")
            if vid.startswith(mc_version) and "forge" in vid.lower():
                installed = vid
                break

        if not installed:
            versions_dir = os.path.join(minecraft_dir, "versions")
            if os.path.exists(versions_dir):
                for d in os.listdir(versions_dir):
                    if d.startswith(mc_version) and "forge" in d.lower():
                        installed = d
                        break

        version_id = installed if installed else mc_version
        options = {
            "username": username,
            "uuid": uuid if uuid else "00000000-0000-0000-0000-000000000000",
            "token": access_token if access_token else "0"
        }
        if java_path and os.path.exists(java_path):
            options["executablePath"] = java_path
        cmd = minecraft_launcher_lib.command.get_minecraft_command(version_id, minecraft_dir, options)
        print(json.dumps({"success": True, "command": cmd}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))


def main():
    parser = argparse.ArgumentParser(description="Forge Installer CLI")
    subparsers = parser.add_subparsers(dest="command")

    # get-version command
    version_parser = subparsers.add_parser("get-version")
    version_parser.add_argument("--mc-version", default="1.8.9", help="Minecraft version")

    # install command
    install_parser = subparsers.add_parser("install")
    install_parser.add_argument("--mc-version", default="1.8.9", help="Minecraft version")
    install_parser.add_argument("--minecraft-dir", required=True, help="Path to custom launcher directory")
    install_parser.add_argument("--forge-version", default="auto", help="Forge loader version")
    install_parser.add_argument("--java-path", default=None, help="Path to Java binary executable")

    # get-command command
    cmd_parser = subparsers.add_parser("get-command")
    cmd_parser.add_argument("--mc-version", default="1.8.9", help="Minecraft version")
    cmd_parser.add_argument("--minecraft-dir", required=True, help="Path to custom launcher directory")
    cmd_parser.add_argument("--username", default="Player", help="Username")
    cmd_parser.add_argument("--uuid", default="", help="UUID")
    cmd_parser.add_argument("--access-token", default="", help="Access token")
    cmd_parser.add_argument("--java-path", default=None, help="Path to Java binary")

    args = parser.parse_args()

    if args.command == "get-version":
        get_forge_version(args.mc_version)
    elif args.command == "install":
        install_forge(args.mc_version, args.minecraft_dir, args.forge_version, args.java_path)
    elif args.command == "get-command":
        get_launch_command(args.mc_version, args.minecraft_dir, args.username, args.uuid, args.access_token, args.java_path)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
