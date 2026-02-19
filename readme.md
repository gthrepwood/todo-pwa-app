docker build -t small-todo:v1 .

docker run -p 3004:3004 small-todo:v1

docker ps | grep :3004

netstat -tulpn | grep :3004

const PORT = process.env.PORT || 3004;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});

lsof -i :3004

kill -9 12345