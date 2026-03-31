import subprocess

Import("env")

VERSION_ID = "unknown"

try:
    # Get the latest git commit SHA (short)
    VERSION_ID = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"]).decode("ascii").strip()
    VERSION_ID = f"build-{VERSION_ID}"
except Exception:
    # Fallback if git is not available or not a repo
    import time
    VERSION_ID = f"local-{int(time.time())}"

print(f"--- INJECTING BUILD VERSION: {VERSION_ID} ---")

# Pass it to the build system as a global macro
env.Append(CPPDEFINES=[
    ("FIRMWARE_VERSION_ID", env.StringifyMacro(VERSION_ID))
])
