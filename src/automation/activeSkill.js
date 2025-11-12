// Active Skill Automation
// Procedure to activate a skill that speeds up the game

async function activateActiveSkill(dependencies) {
    const { performClick, scrollDown, CLICK_AREAS, iphoneMirroringRegion, updateStatus, updateCurrentFunction } = dependencies;
    
    updateCurrentFunction('activateActiveSkill');
    updateStatus('Activating Active Skill...', 'info');
    console.log('DEBUG: Starting Active Skill activation sequence');
    
    try {
        // 1. Click off, wait 75ms
        console.log('DEBUG: [ACTIVE SKILL] Step 1: Click off');
        await performClick(CLICK_AREAS.CLICK_OFF.x, CLICK_AREAS.CLICK_OFF.y);
        await new Promise(resolve => setTimeout(resolve, 75));
        
        // 2. Single click at x230, y210, wait 75ms
        console.log('DEBUG: [ACTIVE SKILL] Step 2: Click at (230, 210)');
        await performClick(230, 210);
        await new Promise(resolve => setTimeout(resolve, 75));
        
        // 3. Single click at x350, y560, wait 75ms
        console.log('DEBUG: [ACTIVE SKILL] Step 3: Click at (350, 560)');
        await performClick(350, 560);
        await new Promise(resolve => setTimeout(resolve, 75));
        
        // 4. Scroll down 150px, wait 100ms
        console.log('DEBUG: [ACTIVE SKILL] Step 4: Scroll down 150px');
        const scrollX = iphoneMirroringRegion.x + iphoneMirroringRegion.width / 2;
        const scrollY = iphoneMirroringRegion.y + iphoneMirroringRegion.height / 2;
        await scrollDown(scrollX, scrollY, 150);
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 5. Single click at x310, y630
        console.log('DEBUG: [ACTIVE SKILL] Step 5: Click at (310, 630)');
        await performClick(310, 630);
        
        // 6. Single click at x230, y630
        console.log('DEBUG: [ACTIVE SKILL] Step 6: Click at (230, 630)');
        await performClick(230, 630);
        
        // 7. Single click at x140, y630, wait 150ms
        console.log('DEBUG: [ACTIVE SKILL] Step 7: Click at (140, 630)');
        await performClick(140, 630);
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // 8. Single click at x350, y560, wait 75ms
        console.log('DEBUG: [ACTIVE SKILL] Step 8: Click at (350, 560)');
        await performClick(350, 560);
        await new Promise(resolve => setTimeout(resolve, 75));
        
        // 9. Click off
        console.log('DEBUG: [ACTIVE SKILL] Step 9: Final click off');
        await performClick(CLICK_AREAS.CLICK_OFF.x, CLICK_AREAS.CLICK_OFF.y);
        
        console.log('DEBUG: Active Skill activation sequence completed successfully');
        updateStatus('Active Skill Activated!', 'success');
        
        return { success: true };
    } catch (error) {
        console.error('ERROR: Active Skill activation failed:', error);
        updateStatus('Active Skill activation failed', 'error');
        return { success: false, error: error.message };
    }
}

module.exports = {
    activateActiveSkill
};

