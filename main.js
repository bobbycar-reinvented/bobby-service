import express from 'express';
import * as um from './usermanager.js';
import { router as public_router, generateRenderOptions } from './public.js';
import cookieParser from 'cookie-parser';
import { __dirname } from './utils.js';
import 'ejs';

const app = express();

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
