# Game

This is a game inspired on Portal, Super Mario World and Team Fortress, my favorite games :)

Play it on [http://mpg.sl.pt](http://mpg.sl.pt)


# Tech

Using pure canvas all the time, so that I can learn canvas and its limitations.

Browserify is used because there is a ton of shared code between client code and server code.

Node streams are used to sync the client+server world. They also provide some code reusability. For example, when there's no server world (for example [http://mpg.sl.pt:8080/singleplayer.html](here, although the enemy AI is NOT agressive at all)), simply createReadStream() will never be called on the game engine, and the player's keyboard (and onscreen keyboard) events (which are streams) won't be piped to a server socket, they are piped to the local player instead. Implementing a spectator mode was very easy because of streams too, and if I ever decide to implement a save game/replay game function, I just have to pipe a game sync stream with timestamps to/from a file. Yay!

I know unreliable transforms are superior for realtime games, but the web doesn't have an unreliable transport. Other than WebRTC data channels. But I'm lazy and they're under used and under supported so I just used WebSocket.

I am trying out ES6 because I love arrows so I'm using Traceur to transform code.


# Philosophy

I just want to play around with game development and try out new web things and see how it goes!

And I'm enjoying it!


# License

WTFPL

