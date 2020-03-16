const express = require("express");
const app = express();
var admin = require("firebase-admin");
var cors = require("cors");
let http = require("http");
let server = http.Server(app);
const bodyParser = require("body-parser");
let socketIO = require("socket.io");
let io = socketIO(server);
// app.use(bodyParser.urlencoded({ extended: false }))
var serviceAccount = require("./secret/serviceAccountKey.json");
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true
  })
);
app.use(cors());
// app.all("/*", function(req, res, next){
//   res.header('Access-Control-Allow-Origin', '*');
//   res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
//   res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
//   next();
// });
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://social-connect-5e34a.firebaseio.com"
});

let db = admin.firestore();

const port = process.env.PORT || 3000;

var currentLoggedInUsers = {};

// db.collectionGroup('messages').where('recieverId' , '==' , '1xbZWFiZeAcRb0kvbJneJZpoq5F3').

const example = async (snapshot, counter) => {
  for (const snap of snapshot) {
    // console.log(snap.ref);
    await snap.ref.update({ status: 1 });
    counter++;
    // x = await returnNum(x);
    // console.log("after each timeout " , x);
  }

  return counter;
};
// const returnNum = x => {
//   x++;
//   return new Promise((resolve, reject) => {
//     setTimeout(() => {
//       resolve(x);
//     }, 1000);
//   });
// }

io.on("connection", socket => {
  console.log(socket.handshake.headers.uid)

  console.log("user connected");
  console.log(socket.id);
  console.log("UserID for this socket is:" + socket.handshake.query.uid);
  var uid = socket.handshake.query.uid;

  if(uid == null){
    uid = socket.handshake.headers.uid;
  }
  currentLoggedInUsers[uid] = socket.id;

  db.collectionGroup("messages")
    .where("recieverId", "==", uid)
    .where("status", "==", 0)
    .get()
    .then(snapshot => {
      // let promise;

      // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
      // console.log(snapshot.docs.values());
      counter = 0;
      example(snapshot.docs.values(), counter).then(cnt => {
        // console.log("after updation the value of counter is : ", cnt);
        getAllfriends(uid).then(array => {
          if (array.length > 0) {
            array.forEach(data => {
              console.log("notify online send to ", currentLoggedInUsers[data]);
              io.to(currentLoggedInUsers[data]).emit("status-change", {
                uid: uid,
                status: 1
              });
            });
          }
        });
      });
    })
    .catch(e => {
      console.log(e);
    });

  // currentLoggedInUsers.push({
  //   [uid] : socket.id
  // })
  console.log("current status of array:");
  console.log(currentLoggedInUsers);
  socket.on("new-message", message => {
    console.log("THE MESSAGE IS :------");
    console.log(message);
    db.collection("chats")
      .doc(message.room)
      .collection("messages")
      .doc(message.time.toString())
      .set(message)
      .then(data => {
        console.log(message.room);

        db.collection("chats")
          .doc(message.room)
          .set(message);
        //  socket.emit("message-recieve" , message);
        // io.in(message.room).emit("message-recieve", message);
        io.to(message.room).emit("message-recieve", message);
      });
  });

  socket.on("send-video-call-request" , message=>{
    console.log(message);
    console.log("now sending request for video call to user," , message.touid);
    io.to(currentLoggedInUsers[message.touid]).emit("recieve-video-call-request" , {offer:message.offer , fromid: uid});
  });

  socket.on("send-video-call-answer" , message=>{
    console.log(message);
    console.log("now sending Answer to for video call to user," , message.touid);
    io.to(currentLoggedInUsers[message.touid]).emit("recieve-video-call-answer" , {answer:message.offer , fromid: uid});
  })

  socket.on("message-read", message => {
    console.log("MESSAGE-------READ-----");
    console.log(message);
    db.collection("chats")
      .doc(message.room)
      .collection("messages")
      .doc(message.time.toString())
      .update({ status: 2 })
      .then(data => {
        io.to(currentLoggedInUsers[message.senderId]).emit(
          "message-read-ack",
          message
        );
      });
  });

  const changeReadStatus = async (snapshot, senderId) => {
    var counter = 0;
    for (const snap of snapshot) {
      if (snap.data().senderId == senderId) {
        await snap.ref.update({ status: 2 });
      }
      counter++;
    }

    return counter;
  };
  socket.on("message-read-all", message => {
    console.log("MESSAGE-------READ-----ALL-----------");
    console.log(message);

    db.collection("chats")
      .doc(message.roomId)
      .collection("messages")
      .where("status", "<=", 1)
      .get()
      .then(snapshot => {
        if (snapshot.docs.length) {
          changeReadStatus(snapshot.docs.values(), message.id).then(data => {
            console.log(
              "counter after updating message-all-read status......",
              data
            );
            io.to(currentLoggedInUsers[message.id]).emit(
              "message-read-all-ack",
              {
                ackBy: uid,
                room: message.roomId
              }
            );
          });
        }
      });
  });

  socket.on("send-friend-request", message => {
    // currentLoggedInUsers
    // console.log(message.uid + " by " + currentLoggedInUsers[uid]);
    console.log();
    console.log(currentLoggedInUsers[message.uid]);
    // socket.emit('notification-recieved', {uid});
    console.log(uid, " has send a friend request to ", message.uid);
    db.collection("users")
      .doc(message.uid)
      .collection("requests")
      .doc(uid)
      .set({
        fromUID: uid,
        status: "pending",
        timestamp: Date.now()
      })
      .then(data => {
        db.collection("users")
          .doc(uid)
          .get()
          .then(doc => {
            var newReq = [];
            console.log("1111111111111111111111111111111111111");
            console.log(doc.data().sentRequestsToUID);
            if (doc.data().sentRequestsToUID) {
              if (!doc.data().sentRequestsToUID.includes(message.uid)) {
                var newReq = doc.data().sentRequestsToUID;
                newReq.push(message.uid);
              } else {
                var newReq = doc.data().sentRequestsToUID;
              }
            } else {
              newReq.push(message.uid);
            }
            console.log("updated Array");
            console.log(newReq);
            db.collection("users")
              .doc(uid)
              .update({
                sentRequestsToUID: newReq
              })
              .then(data => {
                io.to(currentLoggedInUsers[message.uid]).emit(
                  "notification-recieved",
                  {
                    uid
                  }
                );
                io.to(currentLoggedInUsers[uid]).emit(
                  "add-friend-request-sent",
                  {
                    uid: message.uid
                  }
                );
                console.log("notification sent");
              });
          });
      });
  });

  socket.on("delete-friend-request", message => {
    console.log(
      uid,
      "wants to delete the friend request sent by ",
      message.uid
    );

    db.collection("users")
      .doc(uid)
      .collection("requests")
      .doc(message.uid)
      .delete()
      .then(data => {
        console.log("Data after deleteing doc from requests collection");
        console.log(data);

        db.collection("users")
          .doc(message.uid)
          .get()
          .then(doc => {
            console.log("Before filtering");
            console.log(doc.data().sentRequestsToUID);
            var tempArray = [];
            if (doc.data().sentRequestsToUID) {
              doc.data().sentRequestsToUID.forEach(element => {
                console.log("Element of temp array is :", element);
                if (element != uid) {
                  tempArray.push(element);
                }
              });
              console.log("After filtering");
              console.log(tempArray);

              db.collection("users")
                .doc(message.uid)
                .update({
                  sentRequestsToUID: tempArray
                })
                .then(data => {
                  io.to(currentLoggedInUsers[message.uid]).emit(
                    "friend-request-rejected",
                    {
                      uid
                    }
                  );
                  io.to(currentLoggedInUsers[uid]).emit(
                    "friend-request-deleted-acknowledgement",
                    {
                      uid: message.uid
                    }
                  );
                });
            }
          });
      });
  });

  socket.on("accept-friend-request", message => {
    console.log("----------------accept-friend-request ");
    console.log(uid, "has accepted the friend request of ", message.uid);
    var randomString = getRandomString();
    ref1 = db.collection("users").doc(message.uid);
    ref2 = db.collection("users").doc(uid);
    db.collection("users")
      .doc(uid)
      .collection("friends")
      .doc(message.uid)
      .set({
        timestamp: Date.now(),
        uid: message.uid,
        personalRoomID: randomString,
        uRef: ref1
      })
      .then(doc => {
        // console.log("=============== 1");

        db.collection("users")
          .doc(message.uid)
          .collection("friends")
          .doc(uid)
          .set({
            timestamp: Date.now(),
            uid: uid,
            personalRoomID: randomString,
            uRef: ref2
          })
          .then(doc => {
            db.collection("users")
              .doc(uid)
              .collection("requests")
              .doc(message.uid)
              .delete()
              .then(data => {
                console.log("=========================");
                console.log(data);
                db.collection("users")
                  .doc(message.uid)
                  .get()
                  .then(doc => {
                    console.log("doc of ", message.uid);
                    console.log(doc.data());
                    var sentReqArray = doc.data().sentRequestsToUID;
                    console.log(sentReqArray);
                    sentReqArray.splice(sentReqArray.indexOf(uid), 1);
                    db.collection("users")
                      .doc(message.uid)
                      .update({
                        sentRequestsToUID: sentReqArray
                      })
                      .then(data => {
                        io.to(currentLoggedInUsers[uid]).emit(
                          "accept-friend-notification-recieved",
                          {
                            uid: message.uid
                          }
                        );
                        io.to(currentLoggedInUsers[message.uid]).emit(
                          "accept-friend-notification-recieved",
                          {
                            uid: message.uid
                          }
                        );
                      });
                  });
              });
          });
      });
  });
  socket.on("create", function(room) {
    console.log("CREATE REQUEST +++++++++");
    socket.join(room);
    console.log(socket.id, " is the New User in Room ", room);
  });

  socket.on("typing", message => {
    // console.log("recieved at server and sending to ...")
    socket
      .to(currentLoggedInUsers[message.senderId])
      .emit("recieve-typing", { status: 1, message: message });
  });

  socket.on("disconnect", function() {
    console.log(uid + " Got disconnect!");

    getAllfriends(uid).then(array => {
      console.log("DATA IS : ");
      console.log(array);
      console.log("AFTER GET_ALL_FRIENDS");
      io.to(currentLoggedInUsers[array[0]]).emit("status-change", {
        uid: uid,
        status: 0
      });
      if (array.length > 0) {
        array.forEach(data => {
          console.log("notify offline send to ", currentLoggedInUsers[data]);
          io.to(currentLoggedInUsers[data]).emit("status-change", {
            uid: uid,
            status: 0
          });
        });
      }

      delete currentLoggedInUsers[uid];
      console.log("status of array after disconnection");
      console.log(currentLoggedInUsers);
    });
  });

  socket.on("test", message=>{
    console.log("THIS A TEEEEEEEEEEEEEEST event by uid ",uid," and the data is :------ " ,message)
  })

  function testfunction() {
    console.log("Current UID is : ", uid);
  }
});

function getAllfriends(uid) {
  let promise = new Promise(function(resolve, reject) {
    db.collection("users")
      .doc(uid)
      .collection("friends")
      .get()
      .then(snapshot => {
        var array = [];
        if (snapshot.docs.length) {
          snapshot.forEach(doc => {
            array.push(doc.data().uid);
          });
          console.log("INSIDE IF");
          console.log(array);
          resolve(array);
        } else {
          console.log("INSIDE ELSE");
          console.log(array);
          resolve(array);
        }
      });
  });
  return promise;
}

app.get("/api/test", (req, res) => {
  console.log(req.headers["token"]);

  console.log("Request found!!!!!!!!!!!!!!!!!!");

  res.send({
    message: "Sucessfull Request"
  });

  // db.collection("friends")
  //   .doc(req.body.uid)
  //   .get()
  //   .then(doc => {
  //     console.log(doc.data().requests);

  //     res.send({
  //       status: 1,
  //       message: "sucess"
  //     });
  //   });
});

app.get("/", function(req, res) {
  res.send("Hello There");
});

app.post("/api", (req, res) => {
  // console.log("Token is : ");
  // console.log(req.headers  ['token']);
  // res.send(req.body)
  admin
    .auth()
    .verifyIdToken(req.headers["token"])
    .then(function(decodedToken) {
      console.log("DecodedToken :");
      console.log(decodedToken);
      let uid = decodedToken.uid;
      console.log("decoded Token Id:" + uid);
      res.send({
        status: 1,
        message: decodedToken
      });
    })
    .catch(function(error) {
      console.error("Fetch failed" + error);
      res.send({
        status: 0,
        message: error
      });
    });
});

const getMessageCount = async (snapshot, uid) => {
  var friendsuids = [];
  var friends = [];
  for (const snap of snapshot) {
    // console.log(snap.ref);
    friendsuids.push(snap.data().uid);
    var friend = snap.data();
    // friends.push(snap.data());
    let roomId = snap.data().personalRoomID;
    let snapsht = await db
      .collection("chats")
      .doc(roomId)
      .collection("messages")
      .where("status", "<=", 1)
      // .where("recieverId" , '==' , uid)
      .get();

    var length = 0;
    snapsht.forEach(d => {
      if (d.data().recieverId == uid) {
        length++;
      }
    });
    let frienddatasnap = await snap.data().uRef.get();
    console.log("---------------------");
    frienddata = frienddatasnap.data();
    // length = snapsht.docs.length;
    var latestmessage = await db
      .collection("chats")
      .doc(roomId)
      .get();

    if (latestmessage.data() == null) {
      Object.assign(frienddata, {
        unreadMessagesCount: length,
        personalRoomID: friend.personalRoomID,
        timestamp: friend.timestamp,
        latestmessage: " ",
        latestmessagetime: " ",
        latestmessagesenderId: " "
      });
    } else {
      Object.assign(frienddata, {
        unreadMessagesCount: length,
        personalRoomID: friend.personalRoomID,
        timestamp: friend.timestamp,
        latestmessage: latestmessage.data().message,
        latestmessagetime: latestmessage.data().time,
        latestmessagesenderId: latestmessage.data().senderId
      });
    }

    friends.push(frienddata);
    // counter++;
    // x = await returnNum(x);
    // console.log("after each timeout " , x);
  }

  return friends;
};

app.get("/api/getAllfriends", (req, res) => {

  console.log("jshljashdjahsdjasdjashdjahdjashdjasdasd");
  // console.log(req)s
  admin
    .auth()
    .verifyIdToken(req.headers["token"])
    .then(function(decodedToken) {
      let uid = decodedToken.user_id;
      // let uid = req.body.uid;
      db.collection("users")
        .doc(uid)
        .collection("friends")
        .get()
        .then(snapshot => {
          if (snapshot.docs.length) {
            // var friendsuids = [];
            // var friends = [];
            console.log("111111111111111111111111111111111111");
            getMessageCount(snapshot.docs.values(), uid).then(data => {
              console.log("22222222222222222222222222222222222222");
              console.log(data);

              res.send({
                status: 1,
                message: data
              });
            });
            console.log("33333333333333333333333333333333");
            // snapshot.forEach(data => {
            //   friendsuids.push(data.data().uid);
            //   friends.push(data.data());
            // });
          } else {
            var friendsuids = [];
            res.send({
              status: 0,
              message: "No Friends Found"
            });
          }
        });
    })
    .catch(function(error) {
      console.error("Fetch failed" + error);
      res.send({
        status: 0,
        message: error
      });
    });
});

app.post("/api/userdetail", function(req, res) {
  var data = req.body;
  admin
    .auth()
    .verifyIdToken(req.headers["token"])
    .then(function(decodedToken) {
      // console.log("DecodedToken :")
      // console.log(decodedToken)
      let uid = decodedToken.user_id;
      console.log(data);
      let docRef = db.collection("users").doc(uid);
      docRef
        .update({
          city: data.city,
          address: data.address,
          contactno: data.contact,
          birthdate: data.birthdate,
          gender: data.gender
        })
        .then(data => {
          res.send({
            status: 1,
            message: decodedToken
          });
        });
      // console.log("decoded Token Id:" + uid)
    })
    .catch(function(error) {
      console.error("Fetch failed" + error);
      res.send({
        status: 0,
        message: error
      });
    });
});

app.get("/api/getallrequests", (req, res) => {
  // admin
  //   .auth()
  //   .verifyIdToken(req.headers["token"])
  //   .then(function(decodedToken) {
  // console.log("DecodedToken :")
  // console.log(decodedToken)
  // let uid = decodedToken.user_id;
  // console.log("decoded Token Id:" + uid)
  // console.log("inside getallrequests");
  // console.log(uid);

  const uid = req.body.uid;
  db.collection("users")
    .doc(uid)
    .collection("requests")
    .get()
    .then(snapshot => {
      var documents = [];

      if (snapshot.docs.length > 0) {
        snapshot.forEach(doc => {
          // console.log(doc.id, '=>', doc.data());
          documents.push(doc.data());
        });
        res.send({
          status: 1,
          message: documents
        });
      } else {
        res.send({
          status: 0,
          message: "No data Found"
        });
      }
      // console.log("Displayinng the Request from USERS ==> REQUESTS ==> docUID")
      // console.log(snapshot.docs.length)
      // console.log(documents)
      // })
      // .catch(err => {
      //   console.log("Error getting documents", err);
      // });
    });
});

app.get("/api/getuserswithfriendrequest", (req, res) => {
  admin
    .auth()
    .verifyIdToken(req.headers["token"])
    .then(function(decodedToken) {
      let uid = decodedToken.user_id;
      db.collection("users")
        .doc(uid)
        .collection("requests")
        .get()
        .then(doc => {
          var docUID = [];
          console.log(doc.docs.length);
          if (doc.docs.length) {
            doc.forEach(document => {
              console.log("EACH DOCUMENT");
              console.log(document.data());
              docUID.push(document.data().fromUID);
            });
            console.log(docUID);

            db.collection("users")
              .where("uid", "in", docUID)
              .get()
              .then(snapshot => {
                var users = [];
                snapshot.forEach(doc => {
                  users.push(doc.data());
                });

                res.send({
                  status: 1,
                  message: users,
                  reqData: docUID
                });
              })
              .catch(err => {
                res.send({
                  status: 0,
                  message: err
                });
              });
          } else {
            res.send({
              status: 0,
              message: "No Friend Request Found"
            });
          }
        });
    })
    .catch(err => {
      console.log("Error getting documents", err);
    });
});

app.get("/api/getnumberofuserrequest", (req, res) => {
  admin
    .auth()
    .verifyIdToken(req.headers["token"])
    .then(function(decodedToken) {
      let uid = decodedToken.user_id;

      db.collection("users")
        .doc(uid)
        .collection("requests")
        .get()
        .then(snapshot => {
          res.send({
            status: 1,
            message: snapshot.docs.length
          });
        })
        .catch(err => {
          res.send({
            status: 0,
            message: err
          });
        });
    })
    .catch(err => {
      console.log("Error getting documents", err);
    });
});

app.get("/api/userdetail", (req, res) => {
  // console.log("inside profile");
  // console.log(req.headers['token']);
  admin
    .auth()
    .verifyIdToken(req.headers["token"])
    .then(function(decodedToken) {
      // console.log("DecodedToken :")
      // console.log(decodedToken)
      let uid = decodedToken.user_id;
      // console.log("decoded Token Id:" + uid)

      let userDetails = db.collection("users").doc(uid);
      let getDoc = userDetails
        .get()
        .then(doc => {
          if (!doc.exists) {
            console.log("No such document!");
          } else {
            // console.log("Document data:", doc.data());

            res.send({
              status: 1,
              message: doc.data()
            });
          }
        })
        .catch(err => {
          console.log("Error getting document", err);
        });
    })
    .catch(function(error) {
      console.error("Fetch failed" + error);
      res.send({
        status: 0,
        message: error
      });
    });
});

app.post("/api/getuserbyid", (req, res) => {
  console.log("inside get given users");
  // console.log(req.headers['token']);
  console.log(req.body);
  let requestID = req.body.uid;

  admin
    .auth()
    .verifyIdToken(req.headers["token"])
    .then(function(decodedToken) {
      console.log("the Requested user's ID");
      console.log(requestID);

      db.collection("users")
        .doc(requestID)
        .get()
        .then(doc => {
          if (doc.data()) {
            res.send({
              status: 1,
              message: doc.data()
            });
          } else {
            res.send({
              status: 0,
              message: "Empty Document"
            });
          }
        });
    })
    .catch(function(error) {
      console.error("Fetch failed" + error);
      res.send({
        status: 0,
        message: error
      });
    });
});

app.post("/api/setphotourl", (req, res) => {
  console.log("inside setPhotoUrl");
  const photoUrl = req.body.photoUrl;
  admin
    .auth()
    .verifyIdToken(req.headers["token"])
    .then(function(decodedToken) {
      // console.log("DecodedToken :")
      // console.log(decodedToken)
      let uid = decodedToken.user_id;
      // console.log("decoded Token Id:" + uid)

      let userDetails = db.collection("users").doc(uid);

      userDetails
        .update({
          profilePicURL: photoUrl
        })
        .then(data => {
          let userDetails = db.collection("users").doc(uid);
          let getDoc = userDetails
            .get()
            .then(doc => {
              if (!doc.exists) {
                console.log("No such document!");
              } else {
                console.log("Document data:", doc.data());

                res.send({
                  status: 1,
                  message: doc.data()
                });
              }
            })
            .catch(err => {
              console.log("Error getting document", err);
            });
        });
    })
    .catch(function(error) {
      console.error("Fetch failed" + error);
      res.send({
        status: 0,
        message: error
      });
    });
});

app.get("/api/getallusers", (req, res) => {
  let users = [];

  admin
    .auth()
    .verifyIdToken(req.headers["token"])
    .then(function(decodedToken) {
      let uid = decodedToken.user_id;
      var requestedUsers = [];
      var friends = [];
      db.collection("users")
        .doc(uid)
        .get()
        .then(snapshot => {
          console.log("data of the user after updatimg the array");
          console.log(snapshot.data());
          if (snapshot.data().sentRequestsToUID) {
            requestedUsers = snapshot.data().sentRequestsToUID;
          }
          console.log(uid);
          console.log("00000000000000000000000");
          console.log(requestedUsers);

          db.collection("users")
            .doc(uid)
            .collection("friends")
            .get()
            .then(snapshot => {
              if (snapshot.docs.length) {
                snapshot.forEach(doc => {
                  friends.push(doc.data().uid);
                });
              } else {
                friends = [];
              }

              console.log("AFter Getting Friends");
              console.log(friends);

              db.collection("users")
                .get()
                .then(snapshot => {
                  // console.log(snapshot)
                  snapshot.forEach(doc => {
                    console.log(uid, "=>", doc.data().uid);
                    if (doc.data().uid != uid) {
                      var usercpy = doc.data();
                      if (!requestedUsers.includes(doc.data().uid)) {
                        Object.assign(usercpy, { isReqSent: 0 });
                      } else {
                        Object.assign(usercpy, { isReqSent: 1 });
                      }

                      if (friends.includes(doc.data().uid)) {
                        Object.assign(usercpy, { isFriend: 1 });
                      } else {
                        Object.assign(usercpy, { isFriend: 0 });
                      }
                      users.push(usercpy);
                    }
                  });
                  console.log(
                    "00000000000000000000000111111111111111111111111111"
                  );
                  console.log(users);
                  res.send({
                    status: 1,
                    message: users
                  });
                })
                .catch(err => {
                  console.log("Error getting documents", err);
                });
            });
        });
    });
});

app.post("/api/deletefriends", (req, res) => {
  admin
    .auth()
    .verifyIdToken(req.headers["token"])
    .then(function(decodedToken) {
      let uid = decodedToken.user_id;
      let anotheruser = req.body.uid;

      console.log("INSIDE DELETE FRIENDS");
      console.log(uid, " and ", anotheruser, " are to be deleted");
      db.collection("users")
        .doc(uid)
        .collection("friends")
        .doc(anotheruser)
        .delete()
        .then(data => {
          db.collection("users")
            .doc(anotheruser)
            .collection("friends")
            .doc(uid)
            .delete()
            .then(data => {
              io.to(currentLoggedInUsers[uid]).emit("friends-deleted", {
                uid: anotheruser
              });
              console.log("EMMITED TO ", uid);
              io.to(currentLoggedInUsers[anotheruser]).emit("friends-deleted", {
                uid: uid
              });
              console.log("EMMITED TO ", anotheruser);
              res.send({
                status: 1,
                message: "deletion sucess"
              });
            });
        })
        .catch(err => {
          res.send({
            status: 0,
            message: err
          });
        });
    })
    .catch(err => {
      console.log("Error getting documents", err);
    });
});

app.post("/api/getallmessages", (req, res) => {
  var room = req.body.room;

  db.collection("chats")
    .doc(room)
    .collection("messages")
    .get()
    .then(snapshot => {
      var messages = [];
      if (snapshot.docs.length) {
        snapshot.forEach(element => {
          // console.log(element.data())
          messages.push(element.data());
        });
      }
      res.send({
        sucess: 1,
        message: messages
      });
    });
});

app.post("/api/getuseronlinestatus", (req, res) => {
  var uid = req.body.uid;
  console.log(uid in currentLoggedInUsers);
  if (uid in currentLoggedInUsers) {
    res.send({
      status: 1,
      message: "online"
    });
  } else {
    res.send({
      status: 0,
      message: "offline"
    });
  }
});

function getRandomString() {
  return (
    Math.random()
      .toString(36)
      .substring(2, 15) +
    Math.random()
      .toString(36)
      .substring(2, 15)
  );
}

server.listen(port, () => console.log(`listening on http://localhost:${port}`));
