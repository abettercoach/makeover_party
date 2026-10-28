console.log("hello!");

//Initialize the express 'app' object
let express = require("express");
let app = express();

app.use("/", express.static("public"));

//'port' variable allows for deployment
let port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log("App listening at port: " + port);
});

//Initialize HTTP server
let http = require("http");
let server = http.createServer(app);