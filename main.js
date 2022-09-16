const express = require('express');
const app = express();
const um = require('./usermanager');
const { public_router, generateRenderOptions } = require('./public');
const cookieParser = require('cookie-parser');

app.disable('x-powered-by');


app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.use(cookieParser());

app.use(um.update);

app.use('/', public_router);

app.use('/api', um.router);

app.use(async (req, res, next) => {
    const options = await generateRenderOptions(req)
    res.status(404).render('templates/404', { data: options });
})

app.listen(42424, '127.0.0.1', () => {
    console.log('server running on port 42424');
});
