import * as schedule from 'node-schedule'
import { Axios } from './axios'
import { DingLink } from '../config/basciConfig'
import * as cheerio from 'cheerio'
import * as dayjs from 'dayjs'

type TaskConfig = {
  name: string,
  path: string,
  list: string,
  title: string,
  messageURL: string,
  from: string,
  picURL?:string,
  time: string,
  is_static: boolean,
  hour?: number | number[],
  minute?: number | number[],
  dayOfWeek?: number[],
  second?: number
}

type MessageSingle = {
  title: string,
  messageURL: string,
  from: string,
  hasPublic: boolean,
  time?: number,
  picURL?: string
}


/** 静态站点爬取
 * @param url 单个静态站点信息
 */
const singleTask = async (url:TaskConfig, taskArr: any) => {
  const rule = new schedule.RecurrenceRule()
  rule.hour = url.hour ? url.hour : 8
  rule.minute = url.minute ? url.minute : 50
  rule.dayOfWeek = url.dayOfWeek ? url.dayOfWeek : [1,2,3,4,5]
  schedule.scheduleJob(rule, async () => {
    try {
      const { data } = await Axios.get(url.path)
      const html:string | cheerio.Root = /<body[^>]*>([\s\S]+?)<\/body>/i.exec(data)[1]
      const $ = cheerio.load(html)
      const list = $(url.list)
      const len = list.length
      
      const promiseList = []
  
      for (let k=0;k<len;k++) {
        const title = list.eq(k).find(url.title).text()
        const arr = title.match(/[^\n]+([^\s+])/g)
        // const messageURL = list.eq(k).find(url.messageURL).attr('href')
        arr.forEach((item, idx) => {
          const obj:MessageSingle = {
            title: item,
            messageURL: list.eq(k).find(url.messageURL).eq(idx).attr('href'),
            from: url.from,
            hasPublic: false
          }
          obj.picURL = url.picURL ? list.eq(k).find(url.picURL).eq(idx).attr('src') : '#'
          obj.time = url.time ? dayjs(list.eq(k).find(url.time).eq(idx).text()).valueOf() : 0
          promiseList.push(obj)
        })
      }
      taskArr.setList(promiseList)
    } catch(e) { 
      throw new Error(e)
    }
  })
}

/** 动态站点爬取
 * @param url 单个动态站点信息
 */
const activeTask = async (url: TaskConfig, taskArr:any) => {
  const rule = new schedule.RecurrenceRule()
  rule.hour = url.hour ? url.hour : 8
  rule.minute = url.minute ? url.minute : 50
  rule.dayOfWeek = url.dayOfWeek ? url.dayOfWeek : [1,2,3,4,5]
  schedule.scheduleJob(rule, async () => {
    try {
      const { data } = await Axios.get(url.path)
      const listPath = url.list ? (url.list.indexOf('.') === -1 ? url.list : url.list.split('.')) : ''
      let list:any[] = []
      if (listPath) {
        list = typeof listPath === 'string' ? data[listPath] : eval(`data${listPath.map(item => `.${item}`).join('')}`)
      } else {
        list = [...data]
      }
      const promiseList = []
      list.forEach((item, idx) => {
        const obj:MessageSingle = {
          title: item[url.title],
          messageURL: item[url.messageURL],
          from: url.from,
          hasPublic: false
        }
        obj.picURL = url.picURL ? item[url.picURL] : '#'
        obj.time = url.time ? dayjs(item[url.time]).valueOf() : 0
        promiseList.push(obj)
      })
      taskArr.setList(promiseList)
    } catch (e) {
      throw new Error(e)
    }
  })
}

/** 推送
 *  @param todoList 需要推送的信息列
 */
const publicInformation: (todoList:MessageSingle[])=>Promise<any> = async (todoList:MessageSingle[]) => {
  const pushText = `
  #### 今日新闻推送
  ${todoList.map(item => {
    return `-------${item.from}-------  
    ![screenshoot](${item.picURL})  
    [${item.title}](${item.messageURL})  
    `
  }).join('')}
  `
  const pushInfo = {
    msgtype: 'markdown',
    markdown: {
     title: '今日新闻推送',
     text: pushText
    }
  }
  Axios.post(DingLink, JSON.stringify(pushInfo), {
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(res => {
    console.log('钉钉推送提示发送成功')
  }, err => {
    console.log('钉钉推送发送失败', err)
  })
}

/** 信息队列管理 */
function TaskList () {
  let tasks: MessageSingle[] = []
  /** 设置信息队列 */
  const setList = function (list: MessageSingle[]) {
    list.forEach(j => {
      if (!tasks.find(item => item.messageURL === j.messageURL)) {
        tasks.push(j)
      }
    })
    return tasks
  }
  /** 清空信息队列 */
  const clearTask = function () {
    tasks = []
    return tasks
  }
  /** 获取信息队列 */
  const getTasks = function () {
    return tasks
  }
  /** 变更某条message的属性 */
  const updateTasks = function (idx, key, val) {
    tasks[idx][key] = val
    return tasks
  }
  /** 变更某条消息的发布状态 */
  const changePublic = function (target:MessageSingle, status: boolean) {
    const _target = tasks.find(item => item.messageURL === target.messageURL)
    const idx = tasks.indexOf(target)
    tasks[idx].hasPublic = status
  }
  return {setList, clearTask, getTasks, updateTasks, changePublic}
}
 
/** 任务注册
 * @param rss        包含各个资源站点的JSON字符串
 * @param clear_time 清除新闻队列的时间，24小时制，精确到小时
 * @param push_time  推送时间，24小时制，目前只支持到小时
 * @param push_days  执行推送的时间，[1,2,3,4,5,6,0]对应周一到周末
 */
export const ScheduleTask = (rss:string, clear_time?: number | undefined, push_time?: number | undefined, push_days?: number[] | undefined) => {
  const taskArr = TaskList()
  try {
    const urls = JSON.parse(rss)
    // 爬取任务分发
    urls.urls.map((item:TaskConfig) => {
      if (item.is_static) { // 静态站点，通过html爬取
        singleTask(item, taskArr)
      } else { // 动态站点，通过接口爬取
        activeTask(item, taskArr)
      }
    })
    // 清理队列任务注册
    const clear_rule = new schedule.RecurrenceRule()
    clear_rule.hour = clear_time || 12
    schedule.scheduleJob(clear_rule, async () => {
      taskArr.clearTask()
    })
    // 推送任务注册
    const public_rule = new schedule.RecurrenceRule()
    public_rule.dayOfWeek = push_days || [1,2,3,4,5]
    public_rule.hour = push_time || 19
    public_rule.minute = 14
    schedule.scheduleJob(public_rule, async () => {
      let list = [...taskArr.getTasks()].sort((a, b) => {
        return b.time - a.time
      })
      list = list.map(item => {
        if (!item.hasPublic) { // 未发布->设置tasks内对应项为已发布
          taskArr.changePublic(item, true)
          return item
        }
      }).slice(0, 10)
      if (list.length > 0) {
        publicInformation(list)
      }
    })
  } catch (e) {
    throw new Error(e.message)
  }
}
