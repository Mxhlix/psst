# psst (Phone Notices)

The name is *psst*, the quiet sound you make to catch someone's attention. The count at the bottom right reads `psst 📱 3`: your phone has something for you.

**Scope: the Claude Code desktop app (the Code tab) on Windows, with an Android phone linked through Phone Link.** Other places Claude Code runs are outside that scope. See [Outside the scope](#outside-the-scope).

psst shows, inside the Claude Code desktop app, which apps on your phone have notifications, and lets you read them without picking up the phone. It reads the copy of your phone's notifications that Windows Phone Link already keeps on the PC. psst itself needs no account, no API key and no connector. Phone Link has its own setup on the PC and the phone.

## What you see

- Above the prompt, one icon for each app that has a notification on your phone, newest first, up to 12. The icons are the phone apps' own, as Phone Link copies them to the PC. An app without a usable icon shows its name instead. When the phone has no notifications, nothing is drawn there.
- At the bottom right, a count in Claude Code's own small type: `psst 📱 3`. It shows `📱 0` when the phone has none, so you can see psst is running. Claude Code puts the mod's name in front. The mod API gives a mod only the text after it.
- `/phone` opens a pane with one card per notification, newest first. A card has the app's icon, the app, how long ago, the title, the text, and up to three more lines of what the phone shows when the notification is expanded (a mail's body).
- After you run `/phone notices on`, a short notice shows in the corner of the chat for 8 seconds when a notification arrives: `📱 Gmail · sender — subject`, that is, the app, the notification's title and its text. The whole line is cut at 160 characters. At most 3 show at once, and more become one line, `📱 N more on your phone (/phone)`. Claude Code decides where the notice appears. The mod API lets a mod set only how long it stays. The notice is off by default, `/phone notices off` turns it off again, and the choice stays for later sessions.

Notifications already on the phone when the session starts show in the icons, the count and the pane, but get no notice. A notification dismissed on the phone disappears from all of them. On the author's PC, Phone Link removed it from its copy.

## Windows banners and psst's notice

You can be told that a notification arrived in two ways. Phone Link can show a Windows banner, the pop-up at the bottom right of the screen. psst can show its short notice inside Claude Code for 8 seconds, once you run `/phone notices on`.

If you want only one of them:

- To stop the Windows banners, open Phone Link's Settings > Features > Notifications, and in the list of apps change the app from feed and banner to feed only. The feed is the list of notifications inside the Phone Link app. psst reads the same notifications, so they still show in psst. Do not choose off for the app, and do not switch off Notifications at the top of that page. Phone Link then stops copying those notifications to the PC, and psst cannot show them either.
- To stop psst's notice, run `/phone notices off`.

## What it does not do

- It does not reply to, open or dismiss anything on the phone. It only reads.
- It does not see a notification Phone Link did not copy to the PC (see [What psst cannot see](#what-psst-cannot-see)), and it cannot tell when Phone Link has stopped copying.
- It does not pass notification content to Claude (see [Worried that Claude will see your notifications?](#worried-that-claude-will-see-your-notifications)).
- It follows one phone. With several phones linked, see `databaseFolder` under Settings.
- psst runs inside a session. In the desktop app, a chat in the Code tab becomes a session once a conversation begins there. The screen you get after pressing New, before you send anything, is not a session yet. Closing the desktop app ends its sessions.
- In the terminal, only the count shows; there are no icons.
- It does not understand what a notification says. It shows what the app wrote. A delivery app that posts a notification for each step (tested with one such app) gives one notice and one card per step.

## Requirements

- Windows with Phone Link paired to an Android phone, and Link to Windows on the phone allowed to read notifications. On the phone, search Settings for "Notification access". Tested on Windows 11.
- The Claude Code desktop app with mods. Mods arrived in Claude Code 2.1.287, and psst was tested with 2.1.289.
- An Android phone. Phone Link can also show an iPhone's notifications on Windows 11, but whether they reach the file psst reads has not been checked. Phone Link does not support iPad or Mac.

## Install

In a terminal, run these, then restart the desktop app:

```
claude plugin marketplace add Mxhlix/psst
claude plugin install psst@psst
```

To update later, run `claude plugin marketplace update psst` and `claude plugin update psst@psst`, then restart the desktop app. To remove it, run `claude plugin uninstall psst@psst`.

To try a local copy, put a `.claude-plugin/marketplace.json` like this in the folder that holds `psst`, add that folder with `claude plugin marketplace add <folder>`, install `psst@my-local`, and restart the desktop app:

```json
{
  "name": "my-local",
  "owner": { "name": "me" },
  "plugins": [{ "name": "psst", "source": "./psst" }]
}
```

The desktop app runs the installed copy, not your folder. After changing the folder, raise `version` in `.claude-plugin/plugin.json`, run `claude plugin marketplace update my-local` and `claude plugin update psst@my-local`, and restart the app.

## Settings

| Setting | What it does | Default |
| --- | --- | --- |
| `apps` | Show only these apps. Write app names or Android package names separated by commas (`Gmail, com.google.android.gm`). A name must match whole; case is ignored. Empty shows every app. | empty |
| `ignore` | Never show these apps, matched the same way. An app in both lists is ignored. | `com.microsoft.appmanager` (Link to Windows itself) |
| `content` | `show`: notices and the pane show the title and text. `hide`: a notice shows only `📱 App: new notification`, and a card shows the icon, the app, the time and "New notification". | `show` |
| `ongoing` | `hide`: leave out playback controls and other notifications the phone keeps up while something runs. `show`: treat them like any other. | `hide` |
| `databaseFolder` | Phone Link's database folder, `...\LocalCache\Indexed\<phone>\System\Database`. Set it only if you link more than one phone. | the first phone folder found |

### Seeing and changing them

The desktop app has no settings screen for mods. You can ask Claude, for example "What is in psst's ignore list?", "Add Google Play services to psst's ignore list" or "Remove X from psst's ignore list". The settings live under `pluginConfigs` in `~/.claude/settings.json`. Claude reads and edits that file for you, and Claude Code may ask you to approve the edit.

You can also edit `~/.claude/settings.json` by hand. The desktop app keeps psst's settings under `pluginConfigs` > `psst@inline` > `options`, whichever marketplace psst came from. A terminal session uses `psst@<marketplace>`, such as `psst@psst`.

When tested in the desktop app, a change to `ignore` applied without restarting.

The short notice is not one of these settings. `/phone notices on` and `/phone notices off` switch it at once in that session. psst keeps the choice in its own store, a file Claude Code keeps for each mod under `~/.claude/plugins/store/` (in the desktop app, `psst_inline-<id>.json`), and later sessions start with it. Sessions that are already open take it up when they next start.

## What is shown and what is left out

Every notification Phone Link copies is shown, except these:

| Left out | Why | To see it |
| --- | --- | --- |
| Playback controls of a video or music app, and notifications the phone keeps up while something runs (a download, navigation, a call) | They are not messages, and a player rewrites its notification on every play and pause. | Set `ongoing` to `show`. |
| Apps in your `ignore` list | You chose to. | Remove the app from `ignore`. |
| Apps not in your `apps` list, when you set one | You chose to. | Add the app to `apps`, or empty it. |
| The summary line Android puts on top of a bundle ("2 new messages") | It repeats the notifications under it. | Nothing to do. The notifications themselves are shown. |

When something is left out for one of the first three reasons, the last line of the `/phone` pane says how many and why, for example `2 not shown: 1 playback or ongoing, 1 in your ignore list. To change this, ask Claude to change psst's settings.` The count and the icons include only what is shown.

### What psst cannot see

- A notification Phone Link did not copy never reaches the PC. On the author's PC, Phone Link once stopped copying overnight for about eleven hours, until Phone Link was opened again. psst cannot tell when this happens and keeps showing the last count. If the count stops changing while your phone gets notifications, open Phone Link.
- On Android 15, Phone Link does not receive the content of notifications Android judges sensitive, such as two-factor codes. Microsoft's [Phone Link troubleshooting page](https://support.microsoft.com/en-us/windows/apps/phonelink/troubleshooting-notifications-in-the-phone-link) says it shows "Sensitive notification content hidden" in their place.
- If you rely on a notification, check that it appears in Phone Link itself.

## Specifications

- psst checks Phone Link's files every 5 seconds.
- Above the prompt it shows up to 12 icons. A short notice stays 8 seconds and is cut at 160 characters. On each check, up to 3 notices show, and any more become one line.
- psst can read a file of up to 4 MB. This is a limit Claude Code sets for mods. If Phone Link's notifications file is bigger, psst shows a message in place of the count (see Troubleshooting).
- psst makes no network requests. The only file it writes is its own store, which holds whether the short notice is on or off.
- psst hooks Claude Code's `command.run` only to answer its own `/phone` command; the hook is registered for `phone` alone. It does not see or change any other command.
- With the short notice on, a notice appears when a notification is new, or when its time, title or text changes.
- If Phone Link's data is not found when the session starts, psst says so and does not look again in that session. After pairing a phone, start a new session.
- With several phones linked, psst uses the first phone folder it finds, unless `databaseFolder` is set.
- Each session runs its own psst. With two sessions open, each shows its own icons, count and notices.
- When a change to `apps` or `ignore` makes a notification that is already on the phone visible, psst treats it as new and, with the short notice on, shows a notice for it. Switching `content` between `show` and `hide` does not.

## Messages in the status line

While one of these messages stands, it replaces the count, the icons above the prompt are hidden, and the `/phone` pane shows only that message. Unless noted, each clears by itself on the next check that reads the files without trouble.

| Message | Meaning |
| --- | --- |
| `Phone Link data not found (Windows with a linked Android phone is needed)` | No Phone Link notifications file at session start, or none in the folder set as `databaseFolder`. Pair a phone or fix the setting, then start a new session. This one does not clear by itself. |
| `Phone Link log is over 4 MB, more than a mod can read; quit Phone Link and open it again` | A Phone Link notifications file is bigger than the 4 MB a mod can read. Quitting Phone Link and opening it again makes the file small again (checked on the author's PC). |
| `Phone Link notifications file is over 4 MB, more than a mod can read` | Phone Link's main notifications file is bigger than the 4 MB a mod can read. psst cannot read it while it stays that big. |
| `Phone Link notifications file is gone` | The file disappeared while the session ran. |
| `Phone Link storage has changed; this version of the mod cannot read it` | Phone Link's storage is not a public interface. This appears if an update changes it. |
| `could not read Phone Link notifications` | Reading failed for another reason. |

## Worried that Claude will see your notifications?

psst gives Claude no notification content. The icons, the count, the notices and the `/phone` pane are drawn on your screen and are not passed to Claude. In the author's sessions, their content never reached Claude. `/phone` does leave one line in the conversation, and Claude reads it. That line says only that the pane opened. Where a screen cannot show a pane, it says how many notifications there are and why, or the current status message. For `/phone notices on` and `off`, it says the short notice was turned on or off. It never contains notification text.

Claude can still open Phone Link's files by itself. This has nothing to do with psst and is true whether or not psst is installed. Claude Code can read files on your PC. In auto mode it asks only before its first read outside your working folders, and reads without asking after that ([Claude Code permission modes](https://code.claude.com/docs/en/permission-modes)).

To stop that too, add either of these to `~/.claude/settings.json`. Both were tested: Claude's file tools could no longer open Phone Link's files, and psst kept working.

- Keep Claude out of Phone Link's folder only:

  ```json
  { "permissions": { "deny": ["Read(~/AppData/Local/Packages/Microsoft.YourPhone_8wekyb3d8bbwe/**)"] } }
  ```

- Keep Claude out of every folder outside the project you are working in:

  ```json
  { "permissions": { "blockReadsOutsideWorkingDirectories": true } }
  ```

Claude Code's [permissions documentation](https://code.claude.com/docs/en/permissions) describes what these rules cover and what they do not.

If people near your screen could see it, set `content` to `hide`.

While a session runs, other mods in the same Claude Code can read what psst keeps in Claude Code's session state. With `content` set to `hide`, psst keeps no title or text there. If you run mods you do not trust, set `content` to `hide`, or do not run them together with psst.

[PRIVACY.md](PRIVACY.md) has the details.

## Outside the scope

- The terminal. psst loads there too. On Claude Code 2.1.289 the count showed on its own line under the prompt, with Claude Code's warning mark in front. psst draws the icons only in the desktop app. The rest has not been checked in the terminal.
- Other surfaces, such as VS Code and the web, have not been checked.
- iPhone has not been checked, as noted under Requirements.

## Troubleshooting

- If the count stays the same while new notifications reach the phone, Phone Link has stopped copying them. Open Phone Link and check that the phone shows as connected. If that does not help, follow Microsoft's [Phone Link troubleshooting page](https://support.microsoft.com/en-us/windows/apps/phonelink/troubleshooting-notifications-in-the-phone-link): on the phone, turn notification access for Link to Windows off and on again. The same page says notifications do not come through while the PC is in battery saver or Focus Assist.
- If an app shows as its name instead of an icon, Phone Link keeps no icon for it, or the icon (or `phoneapps.db`) is too big for a mod to read. System services such as Google Play services had no icon on the author's phone. Add them to `ignore` to hide their notifications.
- If `Phone Link log is over 4 MB, more than a mod can read; quit Phone Link and open it again` replaced the count, quit Phone Link from its icon in the notification area of the taskbar, and open it again. On the author's PC this made the file small again, and psst read it.
- For other messages that replaced the count, see [Messages in the status line](#messages-in-the-status-line).

## Try it without a phone

psst needs Windows and a paired Android phone to show real notifications, so there is no account to log in to. To see how it behaves on made-up data, run the tests with Claude Code from the folder that holds `psst`:

```
claude plugin test ./psst
```

The 39 tests read a database that SQLite itself built from invented notifications (`tests/fixtures/make_fixture.py`) and need nothing else. Type-checking with `tsc -p psst` also needs the type definitions Claude Code writes into `.claude-plugin/types/` when it loads a mod for development (see Claude Code's mod documentation). They are not in this repository.

## Support

For questions, problems and security reports, open an issue at https://github.com/Mxhlix/psst/issues or write to contact@found-tools.com. For privacy, see [PRIVACY.md](PRIVACY.md).

---

## 日本語

名前の psst は、英語でそっと人の注意を引くときに出す「ねえ、ちょっと」にあたる音です。右下に `psst 📱 3` と出て、スマホに何か来ていることを小声で知らせる、という意味で付けました。

**対象は、Windows の Claude Code デスクトップアプリ(Code タブ)と、スマートフォン連携でつないだ Android スマホの組み合わせです。** それ以外の場所は対象外です。

psst は、スマホに通知が来ているアプリを Claude Code のデスクトップアプリの中に出し、スマホを手に取らずに中身を読めるようにします。読むのは、Windows のスマートフォン連携が PC に保存している通知です。psst 自体にはアカウントも API キーもコネクタも要りません。スマートフォン連携の設定は、PC とスマホで別に要ります。

### 画面に出るもの

- 入力欄の上に、スマホに通知が来ているアプリのアイコンが新しい順に最大12個並びます。アイコンは、スマートフォン連携が PC に保存したアプリ自身のものです。使えるアイコンが無いアプリは、名前が出ます。
- 右下に件数が `psst 📱 3` のように出ます。0件のときも `📱 0` と出ます。名前と文字の大きさは Claude Code が決めていて、mod が渡せるのは後ろの文字だけです。
- `/phone` を打つと、通知を1件ずつカードにした一覧が開きます。カードには、アイコン、アプリ名、届いてからの時間、題名、本文、展開したときの本文を3行まで出します。
- `/phone notices on` を打つと、通知が届いたときに会話の欄の隅に `📱 アプリ · 題名 — 本文` が8秒出るようになります。160文字を超える分は切ります。一度に出すのは3件までで、それより多いときは `📱 N more on your phone (/phone)` の1行にまとめます。最初は出ません。`/phone notices off` で出なくなります。どちらにしたかは、次のセッションでもそのままです。

セッションを始めたときにすでにあった通知は、アイコンと件数と一覧には出ますが、届いたときの表示は出ません。スマホで通知を消すと、どこからも消えます。作者の PC では、スマートフォン連携が保存していた分から消しました。

### Windows のバナーと psst の短い表示

スマホに通知が届いたことを知る方法は、2つあります。

- Windows のバナーは、画面の右下に出るポップアップです。スマートフォン連携が出します。
- psst の短い表示は、Claude Code の中に8秒出ます。`/phone notices on` を打つまでは出ません。

どちらか1つだけにしたいときは、次のようにしてください。

- Windows のバナーを止めるには、スマートフォン連携の「設定」→「機能」→「通知」→「通知を受け取るアプリの選択」で、そのアプリを「フィードとバナー」から「フィードのみ」にします。フィードは、スマートフォン連携のアプリの中にある通知の一覧です。psst はこの一覧と同じ通知を読むので、フィードのみにしても psst には出ます。アプリを「無効」にはしないでください。同じ画面のいちばん上にある通知のスイッチも切らないでください。どちらも、通知が PC に届かなくなり、psst にも出なくなります。
- psst の短い表示を止めるには、`/phone notices off` を打ちます。

### できないこと

- スマホの通知に返信したり、開いたり、消したりはしません。読むだけです。
- スマートフォン連携が PC に保存しなかった通知は見えません。保存が止まったことにも気づけません。作者の PC では夜のあいだ保存が約11時間止まり、そのあいだ psst は最後の件数を出し続けました。件数が変わらないときは、スマートフォン連携を開いてください。Android 15 では、確認コードのように機密と判断された通知の中身はスマートフォン連携に渡されません([Microsoft のページ](https://support.microsoft.com/en-us/windows/apps/phonelink/troubleshooting-notifications-in-the-phone-link)より)。
- 通知の中身を Claude に渡しません。`/phone` が会話に残す1行は Claude が読みます。書くのは、パネルを開いたことだけです。パネルを出せない画面では、件数とその理由か、そのときの状態の文を書きます。`/phone notices on` と `off` では、短い表示をオンかオフにしたことを書きます。
- 追うのはスマホ1台です。複数台つないでいると、最初に見つけたスマホのフォルダを使います。別のスマホにするときは、設定 `databaseFolder` に `...\LocalCache\Indexed\<スマホ>\System\Database` のフォルダを書きます。
- 通知の意味は判断しません。アプリが書いた文をそのまま出します。
- psst はセッションの中で動きます。デスクトップアプリでは、Code タブのチャットで会話が始まると、そのチャットが1つのセッションになります。「新規」を押しただけの、まだ何も送っていない画面は、まだセッションではありません。デスクトップアプリを閉じると、セッションは終わります。
- ターミナルでは件数だけで、アイコンは出ません。

### 出さないもの

- 動画や音楽の再生の操作と、何かが動いている間スマホが出し続ける通知。設定 `ongoing` を `show` にすると出ます。
- 設定 `ignore` に入れたアプリ。最初に入っているのは、スマホ側の Windows にリンク自身だけです。
- 設定 `apps` を使っているときに、そこに無いアプリ。
- Android がまとまりの上に付ける見出しの行。

上の3つの理由で外した通知があるときは、`/phone` のいちばん下に、何件をなぜ外したかを出します。見出しの行は数えません。

### 必要なものと入れ方

- Windows(Windows 11 で確認)、スマートフォン連携でつないだ Android スマホ、mod が使える Claude Code のデスクトップアプリが要ります。mod は Claude Code 2.1.287 からで、2.1.289 で確認しました。
- スマホでは、Windows にリンクに通知へのアクセスを許可してください。スマホの設定で「通知へのアクセス」を検索すると出ます。
- 入れ方、更新、外し方は、英語の説明の Install にあるコマンドのとおりです。入れたあと、デスクトップアプリを起動し直してください。手元のフォルダから入れる方法も同じ所にあります。

### 設定

- `apps` には、出すアプリだけを、アプリ名かパッケージ名でカンマ区切りに書きます。名前は全体が一致したときだけ当たり、大文字と小文字は区別しません。空ならすべて出します。
- `ignore` には、出さないアプリを書きます。`apps` と両方にあるときは出しません。
- `content` を `show` にすると、題名と本文を出します。`hide` にすると、届いたときの表示は `📱 アプリ名: new notification` だけになり、カードはアイコンとアプリ名と時間と New notification だけになります。題名と本文は、セッションの間の置き場にも置きません。
- `ongoing` が `hide`(最初の設定)のときは、再生の操作と出し続ける通知を外します。
- `databaseFolder` は、スマホを複数台つないでいるときだけ使います。

### 設定の確認と変更

デスクトップアプリには mod の設定画面がありません。Claude に「psst の ignore に何が入ってる?」「X を psst の ignore に足して」のように頼むと、Claude が `~/.claude/settings.json` の `pluginConfigs` を読んで書き換えます。書き換えの前に許可を求められることがあります。手で書き換えるときは、デスクトップアプリでは `pluginConfigs` の `psst@inline` の `options` です。デスクトップアプリで試したときは、ignore の変更が起動し直さずに効きました。

届いたときの短い表示は、この設定には入っていません。`/phone notices on` と `/phone notices off` を打つと、そのセッションではすぐに切り替わります。psst はどちらにしたかを、Claude Code が mod ごとに用意する保存ファイルに残します。置き場所は `~/.claude/plugins/store/` の下で、デスクトップアプリでは `psst_inline-<番号>.json` です。次のセッションは、残した設定のまま始まります。すでに開いているほかのセッションは、次に始めたときから同じになります。

### 仕様

- 5秒ごとに確認します。
- 入力欄の上のアイコンは最大12個です。短い表示は8秒出て、160文字で切ります。1回の確認で出すのは3件までで、それより多い分は1行にまとめます。
- psst が読めるのは1ファイル 4MB までです。これは Claude Code が mod に決めている上限です。スマートフォン連携の通知のファイルがこれより大きいと、右下の件数の代わりに理由の文が出ます(困ったときを見てください)。
- ネットにはつなぎません。psst が書くファイルは、短い表示のオンとオフを残す保存ファイル1つだけです。
- psst が Claude Code の `command.run` を使うのは、自分の `/phone` コマンドを受け取るためだけです。受け取る相手を `phone` だけに絞って登録しています。ほかのコマンドを見たり変えたりはしません。
- 短い表示がオンのときは、通知が新しいときと、時刻か題名か本文が変わったときに表示が出ます。
- セッションを始めたときにスマートフォン連携のデータが見つからないと、そのセッションの間は探し直しません。スマホをつないでから、新しいセッションを始めてください。
- セッションごとに psst が動くので、セッションが2つあれば、それぞれに表示が出ます。
- `apps` や `ignore` を変えて、スマホにすでにある通知が見えるようになると、psst はそれを新しい通知として扱います。短い表示がオンなら、その通知の表示が出ます。`content` の `show` と `hide` を切り替えたときは出ません。
- psst が通知を読めないときは、右下の件数の代わりに理由の文が出ます。そのあいだ、入力欄の上のアイコンは消え、`/phone` を開いてもその文だけが出ます。多くは、5秒後の次の確認で読めれば元に戻ります。文の一覧は、英語の説明の Messages in the status line にあります。

### Claude に通知を見られるのが心配な方へ

psst は通知の中身を Claude に渡しません。ただし Claude Code は、psst とは関係なく、スマートフォン連携のファイルを自分で開けます。auto モードでは、作業フォルダの外を初めて読むときに一度だけ確認を求め、そのあとは確認なしで読みます。これも止めたいときは、英語の説明の Worried that Claude will see your notifications? にある設定のどちらかを `~/.claude/settings.json` に足してください。どちらも試してあり、Claude はファイルを開けなくなり、psst は動き続けました。

画面を人に見られる場面では、設定の `content` を `hide` にしてください。

セッションの間は、同じ Claude Code に入っているほかの mod が、psst がセッションの間に置いたものを読めます。信用できない mod を入れるなら、`content` を `hide` にするか、一緒に使わないでください。

### 困ったとき

- スマホに通知が来ても件数が変わらないときは、スマートフォン連携が通知を保存していません。スマートフォン連携のアプリを開いて、スマホがつながっているかを見てください。直らなければ、Microsoft のページのとおり、スマホで Windows にリンクの通知へのアクセスを一度切ってから入れ直してください。同じページには、PC が省電力や集中モードのときは通知が来ないとも書かれています。
- アイコンの代わりに名前が出るときは、スマートフォン連携にそのアプリのアイコンが無いか、アイコン(または phoneapps.db)が大きすぎて mod が読めません。作者のスマホでは、Google Play 開発者サービスにアイコンがありませんでした。出したくなければ `ignore` に足してください。
- 件数の代わりに `Phone Link log is over 4 MB` で始まる文が出たときは、タスクバーの右下にあるスマートフォン連携のアイコンからスマートフォン連携を終了し、起動し直してください。作者の PC では、これでファイルが小さくなり、psst がまた読めるようになりました。
- ほかの文が出たときは、英語の説明の Messages in the status line を見てください。

### 対象外

- ターミナルでも読み込まれます。Claude Code 2.1.289 で、入力欄の下に件数の行が出ることは確かめました。Claude Code が注意の印を付けます。psst がアイコンを描くのはデスクトップアプリだけです。ほかの動きは、ターミナルでは確かめていません。
- VS Code と Web では確かめていません。
- iPhone では確かめていません。iPad と Mac には、スマートフォン連携自体が対応していません。

### スマホが無くても試すには

英語の説明の Try it without a phone のとおり、`claude plugin test ./psst` を動かすと、作り物のデータを使った39件のテストを試せます。

### 問い合わせ

https://github.com/Mxhlix/psst/issues か contact@found-tools.com までどうぞ。

## License

MIT. See [LICENSE](LICENSE).

Windows, Phone Link and Link to Windows are names of Microsoft products. Android, Gmail and Google Play are trademarks of Google LLC. This project is not affiliated with or endorsed by either company.
