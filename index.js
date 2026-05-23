console.log('[NSFW模型切换器] 插件开始加载...');

// 先试试最简单的方式，不导入任何东西
try {
    console.log('[NSFW模型切换器] 尝试获取全局对象...');
    
    // 检查 jQuery 是否可用
    if (typeof $ === 'undefined') {
        console.log('[NSFW模型切换器] jQuery 未加载');
    } else {
        console.log('[NSFW模型切换器] jQuery 已加载');
    }
    
    // 尝试设置面板
    $(document).ready(() => {
        console.log('[NSFW模型切换器] DOM 已准备好');
        
        setTimeout(() => {
            console.log('[NSFW模型切换器] 尝试添加设置面板...');
            
            const extensionsSettings = $('#extensions_settings');
            console.log('[NSFW模型切换器] extensions_settings 元素数量:', extensionsSettings.length);
            
            if (extensionsSettings.length > 0) {
                const panel = $('<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b><i class="fa-solid fa-shield-halved" style="margin-right: 8px;"></i>NSFW模型切换器</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div></div><div class="inline-drawer-content"><div style="padding: 15px;"><p style="color: green;">插件已加载！</p></div></div></div>');
                
                extensionsSettings.append(panel);
                console.log('[NSFW模型切换器] 设置面板已添加');
            } else {
                console.log('[NSFW模型切换器] extensions_settings 元素未找到，尝试添加到 body');
                const panel = $('<div style="position: fixed; bottom: 20px; right: 20px; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); z-index: 999999;"><h3 style="margin: 0 0 10px 0;">NSFW模型切换器</h3><p style="color: green;">插件已加载！</p></div>');
                $('body').append(panel);
            }
        }, 1000);
    });
    
    console.log('[NSFW模型切换器] 插件加载完成！');
    
} catch (error) {
    console.error('[NSFW模型切换器] 加载出错:', error);
}