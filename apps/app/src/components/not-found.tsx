import { Link } from '@tanstack/react-router'
import { buttonVariants } from '@/components/ui/button'

export function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Nothing here</h1>
      <p className="mt-2 text-muted-foreground">That page doesn’t exist, or it moved.</p>
      <Link to="/" className={buttonVariants({ size: 'lg', className: 'mt-6 rounded-full px-6' })}>
        Go home
      </Link>
    </div>
  )
}
