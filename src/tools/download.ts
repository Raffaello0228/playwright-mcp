/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import * as path from 'path';

import type { ToolFactory } from './tool';

const downloadSchema = z.object({
  selector: z.string().describe('The CSS selector or aria-ref of the download link to click'),
  saveToFolder: z.string().optional().describe('Optional folder path to save the downloaded file. If not specified, the file will be saved to the browser\'s default download location'),
  newFilename: z.string().optional().describe('Optional new filename for the downloaded file. If not specified, the original filename will be used'),
});

const download: ToolFactory = captureSnapshot => ({
  capability: 'files',
  schema: {
    name: 'browser_download',
    description: 'Click a download link and optionally specify where to save the file',
    inputSchema: zodToJsonSchema(downloadSchema),
  },
  handle: async (context, params) => {
    const validatedParams = downloadSchema.parse(params);
    const tab = context.currentTab();
    
    let downloadPath: string | undefined;
    if (validatedParams.saveToFolder) {
      downloadPath = validatedParams.saveToFolder;
    }
    
    return await tab.runAndWait(async tab => {
      const page = tab.page;
      
      // 如果指定了下载路径，配置浏览器下载到指定文件夹
      if (downloadPath) {
        await page.context().setDefaultDownloadPath(downloadPath);
      }
      
      // 使用Playwright推荐的方式等待下载
      // 在JavaScript中，我们需要在点击前创建下载Promise
      const downloadPromise = page.waitForEvent('download');
      
      // 点击下载链接
      const locator = validatedParams.selector.startsWith('[ref=') 
        ? tab.lastSnapshot().refLocator(validatedParams.selector.slice(5, -1))
        : page.locator(validatedParams.selector);
      
      await locator.click();
      
      // 等待下载开始并获取下载对象
      const download = await downloadPromise;
      
      // 获取建议的文件名
      const suggestedFilename = await download.suggestedFilename();
      
      // 构建保存路径
      let savePath: string;
      
      // 如果提供了新文件名，使用新文件名
      if (validatedParams.newFilename) {
        const fileExt = path.extname(suggestedFilename);
        const newFilename = validatedParams.newFilename + (validatedParams.newFilename.endsWith(fileExt) ? '' : fileExt);
        savePath = path.join(downloadPath || '', newFilename);
      } else {
        // 否则使用原始文件名
        savePath = path.join(downloadPath || '', suggestedFilename);
      }
      
      // 保存文件
      await download.saveAs(savePath);
      
      // 等待下载完成
      await download.path();
    }, {
      status: `已从 ${validatedParams.selector} 下载文件，保存为: ${validatedParams.newFilename || '原始文件名'}`,
      captureSnapshot,
    });
  },
});

export default (captureSnapshot: boolean) => [
  download(captureSnapshot),
]; 
