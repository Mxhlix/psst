export type Notice = {
  key: string
  packageName: string
  app: string
  title: string
  text: string
  // What the phone shows below `text` when the notification is expanded (a
  // mail's body), at most three lines; empty when there is none.
  body: string
  postTime: number
}

declare module 'claude-code' {
  interface PluginState {
    'psst': {
      notices: Notice[]
      known: Record<string, string>
      primed: boolean
      problem: string
      iconsRead: number
      hidden: { ignored: number; notChosen: number; ongoing: number }
    }
  }
}
