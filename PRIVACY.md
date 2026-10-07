# Privacy

psst (Phone Notices) is a Claude Code mod for the Claude Code desktop app on Windows. It shows which apps on your Android phone have notifications and lets you read them inside Claude Code. This page says what it reads, what it keeps, what it sends and what Claude receives. It describes psst 0.3.0 and later.

## What it reads

psst reads only these files on your own PC. Every 5 seconds it checks the size and time of the notification files, and reads them when they have changed. While a read came back empty or a status message stands, it reads them on each check. It checks and reads the icon files only when an app it has not seen before appears.

The files are in Phone Link's folder for your phone, `%LOCALAPPDATA%\Packages\Microsoft.YourPhone_8wekyb3d8bbwe\LocalCache\Indexed\<phone>\System\Database`, or in the folder you set as `databaseFolder`:

| File | What psst takes from it |
| --- | --- |
| `notifications.db` and `notifications.db-wal` | The notifications Windows Phone Link copied from your phone: app, title (often the sender), text, up to three more lines of the expanded notification (a mail's body), time, and a few markers (whether it is a bundle summary, a playback control or ongoing). |
| `phoneapps.db` and `phoneapps.db-wal` | The icons of your phone's apps. |

To find your phone's folder, psst lists the folder names under `...\LocalCache\Indexed`. The same folder also holds Phone Link's other databases, such as `contacts.db`, `photos.db`, `calling.db` and `phone.db`. psst never opens them.

A mod can read a file only whole. It cannot read part of one. Phone Link writes a new notification first to `notifications.db-wal` and moves it into `notifications.db` later, so psst has to read both files to see new notifications. With them come older contents still left in the files, waiting to be overwritten: notifications already dismissed on the phone, and earlier versions of changed ones. psst uses none of that. It builds the list from the notifications Phone Link holds now, and drops the rest at once. On the author's PC, this list matched Phone Link's feed (the list inside the Phone Link app). The rest is not shown, not kept and not passed to anyone, Claude included. Reading only part of a file would need another program, and psst runs none.

## What it keeps

For the running session, psst keeps these in Claude Code's session state:

- the notifications currently on your phone (app, package name, Android's notification key, title, text, body lines and time), so the count, the icons and the `/phone` pane can be drawn;
- a short hash of each one's time, title and text, to notice when one is new or changed;
- how many notifications the settings `apps`, `ignore` and `ongoing` left out, and why;
- the current status message, if any;
- two markers with no content: whether the first read is done, and how often the icons were read.

All of this is gone when the session ends. psst keeps no history.

With `content` set to `hide`, the title, text and body are still read on each check, but they are dropped before anything is kept. Session state then holds only the app, the package name, the notification key, the time and the hash for each notification. Android's notification key is made by the app and can include a tag the app chose.

While a session runs, other mods installed in the same Claude Code can read what a mod keeps in session state. If you install mods you do not trust, set `content` to `hide`, or do not run them together with psst.

psst writes one file: its own store, which Claude Code keeps for each mod under `~/.claude/plugins/store/`. It holds only whether the short notice is on or off, and is written when you run `/phone notices on` or `/phone notices off`. It holds no notification content.

## What it sends

Nothing. psst makes no network requests and runs no other programs. `claude plugin validate ./psst` lists every call it makes, and none of them is a network call.

## What Claude receives

No notification content. The icons, the count, the short notices (when turned on) and the `/phone` pane are drawn on your screen only.

`/phone` leaves one line in the conversation. It says that the pane opened. Where a screen cannot show a pane, it says how many notifications there are and why, or the current status message. `/phone notices on` and `/phone notices off` leave a line saying the short notice was turned on or off. Like every line of the conversation, Claude Code saves it with the session and Claude reads it. It never contains notification text.

Claude Code can open Phone Link's files by itself, with or without psst. The README section "Worried that Claude will see your notifications?" shows two settings that stop it. psst keeps working with either.

## Other people's information

Notifications contain things other people wrote to you, such as senders' names, mail subjects and message text. psst shows them only to you, on your screen, and passes them to no one, Claude included.

## Contact

For questions, problems and security reports, write to contact@found-tools.com or open an issue at https://github.com/Mxhlix/psst/issues.

---

## プライバシー(日本語)

psst(Phone Notices)は、Windows の Claude Code デスクトップアプリで使う mod です。Android スマホに通知が来ているアプリを出し、中身を Claude Code の中で読めるようにします。ここには、psst が読むもの、残すもの、送るもの、Claude が受け取るものを書きます。psst 0.3.0 からの説明です。

### 読むもの

通知のファイルは、5秒ごとに大きさと更新時刻を見て、変わったときに中身を読みます。読んだ結果が空だったときと、状態の文が出ているあいだは、確認のたびに読み直します。アイコンのファイルは、まだ見ていないアプリが出たときだけ読みます。

読むのは、この PC のスマートフォン連携のフォルダにある次のファイルだけです。フォルダは `%LOCALAPPDATA%\Packages\Microsoft.YourPhone_8wekyb3d8bbwe\LocalCache\Indexed\<スマホ>\System\Database` か、設定 `databaseFolder` で決めたフォルダです。

- `notifications.db` と `notifications.db-wal` には、スマートフォン連携が保存した通知が入っています。psst が取り出すのは、アプリ、題名(多くは送り主)、本文、展開したときの本文3行まで(メールの本文など)、時刻、いくつかの印です。印は、まとめの見出しか、再生の操作か、出し続ける通知かを表します。
- `phoneapps.db` と `phoneapps.db-wal` からは、スマホのアプリのアイコンを取り出します。

スマホのフォルダを探すために、`...\LocalCache\Indexed` の下のフォルダ名を一覧します。同じフォルダにあるスマートフォン連携のほかのデータ(`contacts.db`、`photos.db`、`calling.db`、`phone.db` など)は開きません。

mod はファイルを丸ごとしか読めず、一部だけを読む方法がありません。スマートフォン連携は、新しい通知をまず `notifications.db-wal` に書き、あとで `notifications.db` に移します。新しい通知を見るには両方を読むしかありません。そのとき、上書きを待って残っている古い中身もいっしょに読み込まれます。スマホで消した通知や、書き換わる前の内容です。psst はそれを使いません。一覧を作るのは、今スマートフォン連携が持っている通知だけで、ほかはすぐに捨てます。作者の PC では、この一覧はスマートフォン連携のフィード(アプリの中の通知の一覧)と同じでした。画面に出さず、残さず、Claude を含めて誰にも渡しません。一部だけを読むにはほかのプログラムが必要になりますが、psst はほかのプログラムを動かしません。

### 残すもの

動いているセッションの間だけ、Claude Code がセッションの間に持つ置き場に、次のものを置きます。

- 今スマホにある通知。アプリ、パッケージ名、Android の通知の番号、題名、本文、展開した本文、時刻です。
- 新しい通知や変わった通知を見分けるための短い値(ハッシュ)。時刻と題名と本文から作ります。
- 設定で外した通知の件数と理由。
- そのときの状態の文。
- 中身を含まない2つの印。最初の読み込みが済んだかどうかと、アイコンを読み直した回数です。

どれもセッションが終わると消えます。履歴は残しません。

`content` を `hide` にしたときは、題名と本文は確認のたびに読みますが、置く前に捨てます。そのときに置くのは、通知ごとにアプリ、パッケージ名、通知の番号、時刻、ハッシュだけです。通知の番号はアプリが作るもので、アプリが決めた目印の文字が入ることがあります。

セッションの間は、同じ Claude Code に入っているほかの mod が、この置き場を読めます。信用できない mod を入れるときは、`content` を `hide` にするか、一緒に使わないでください。

ファイルに書くのは1つだけです。`/phone notices on` か `/phone notices off` を打ったときに、届いたときの短い表示をオンにしたかオフにしたかを書きます。書く先は、Claude Code が mod ごとに用意する保存ファイル(`~/.claude/plugins/store/` の下)です。通知の中身は書きません。

### 送るもの

ありません。ネットにつながず、ほかのプログラムも動かしません。`claude plugin validate ./psst` を動かすと、psst が使う機能が全部一覧で出ます。そこにネットの機能はありません。

### Claude が受け取るもの

通知の中身は受け取りません。アイコン、件数、短い表示(オンにしたとき)、`/phone` のパネルは、画面に出るだけです。

`/phone` は会話に1行を残します。書くのは、パネルを開いたことだけです。パネルを出せない画面では、件数とその理由か、そのときの状態の文を書きます。`/phone notices on` と `off` では、短い表示をオンかオフにしたことを書きます。この1行は、会話のほかの行と同じく Claude Code がセッションと一緒に保存し、Claude が読みます。通知の中身は入りません。

Claude Code は、psst とは関係なく、スマートフォン連携のファイルを自分で開けます。それを止める設定は、README の英語の説明の Worried that Claude will see your notifications? に書いています。止めても psst は動きます。

### ほかの人の情報

通知には、送り主の名前やメールの件名のように、ほかの人が書いたものが入っています。psst はそれをあなたの画面に出すだけで、Claude を含めて誰にも渡しません。

### 連絡先

contact@found-tools.com か https://github.com/Mxhlix/psst/issues までどうぞ。

