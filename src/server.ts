import Koa = require('koa');
// import bodyParser = require('koa-bodyparser');
import * as koaBody from 'koa-body'
import * as path from 'path'
import router from './routes'
import * as fs from 'fs'
import { ScheduleTask } from './tools/schedule'

const app = new Koa();
app.on('error', (err, ctx) => {
  console.log('服务器出错：', err)
})
/** bodyparser取参数 */
app.use(koaBody({
  multipart:true, // 支持文件上传
  // encoding:'gzip',
  formidable:{
    uploadDir:path.join(__dirname,'public/upload/'), // 设置文件上传目录
    keepExtensions: true,    // 保持文件的后缀
    maxFieldsSize: 10 * 1024 * 1024, // 文件上传大小
    onFileBegin:(name,file) => { // 文件上传前的设置
    },
  }
}));

/** 错误处理 */
app.use(async (ctx, next) => {
  const notFound = (await fs.readFileSync(__dirname + '/statics/404.html')).toString()
  try {
    await next()
    if (!ctx.body) {
      ctx.status = 404
      ctx.body = notFound
    }
  } catch (e) {
    ctx.status = 500
    ctx.body = e.message
  }
})
/** 路由挂载 */
app.use(router.routes())

app.listen(3002,'',1, async () => {
  // 从json读取配置
  const rss = await fs.readFileSync(path.join(__dirname,'./config/rss.json'), 'utf-8').toString()
  // 注册爬取任务
  ScheduleTask(rss)
  console.log('server is start!')
});

