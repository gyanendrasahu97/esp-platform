interface Props {
  binUrl: string | null
  buildId: string | null
}

export default function FlashUsb({ binUrl, buildId }: Props) {
  if (!binUrl || !buildId) {
    return (
      <button disabled className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-slate-500 text-sm cursor-not-allowed">
        Flash via USB
      </button>
    )
  }

  // Generate manifest URL pointing to our backend endpoint
  const manifestUrl = `/api/compiler/manifest/${buildId}`

  return (
    <div className="flex items-center gap-2">
      <esp-web-install-button manifest={manifestUrl}>
        <button
          slot="activate"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
        >
          ⚡ Flash via USB
        </button>
      </esp-web-install-button>
      <span className="text-xs text-slate-500">Requires Chrome/Edge + USB cable</span>
    </div>
  )
}
