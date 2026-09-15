import { Dialog, DialogContent } from '@mui/material'

export default function PlanningDialog({ open, title, onClose, busy = false, children }) {
  return <Dialog open={open} onClose={() => { if (!busy) onClose() }} fullWidth maxWidth="md" aria-labelledby="planning-dialog-title" className="planning-dialog">
    <DialogContent className="planning-ui planning-dialog-content">
      <header className="planning-dialog-head"><h2 id="planning-dialog-title">{title}</h2><button type="button" className="planning-icon" aria-label="Cerrar diálogo" disabled={busy} onClick={onClose}>×</button></header>
      {children}
    </DialogContent>
  </Dialog>
}
