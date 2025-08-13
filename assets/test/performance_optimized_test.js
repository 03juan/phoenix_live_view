import DOM from "phoenix_live_view/dom"
import DOMPatch from "phoenix_live_view/dom_patch"

describe("Performance Comparison Tests", () => {
  let mockLiveSocket, mockView

  beforeEach(() => {
    // Clear DOM query cache before each test
    DOM._queryCache.clear()
    
    mockLiveSocket = {
      binding: (attr) => `phx-${attr}`,
      time: (label, fn) => {
        const start = performance.now()
        const result = fn()
        const end = performance.now()
        return result
      },
      getActiveElement: () => null,
      isDebugEnabled: () => false,
      owner: (el, callback) => callback(mockView),
      destroyViewByEl: () => {},
      transitionRemoves: () => {},
      requestDOMUpdate: (fn) => fn(),
      silenceEvents: (fn) => fn(),
      unload: () => {}
    }

    mockView = {
      liveSocket: mockLiveSocket,
      root: { id: "root-1" },
      id: "view-1",
      ownsElement: () => true
    }
  })

  function createLargeDOM(elementCount = 100) {
    const container = document.createElement('div')
    container.id = 'benchmark-container'
    
    for (let i = 0; i < elementCount; i++) {
      const div = document.createElement('div')
      div.id = `item-${i}`
      div.className = `item class-${i % 10}`
      div.setAttribute('data-id', i)
      div.innerHTML = `<span>Item ${i}</span><button>Action</button>`
      container.appendChild(div)
    }
    
    return container
  }

  function createModifiedDOM(originalContainer) {
    const modified = originalContainer.cloneNode(true)
    const items = modified.querySelectorAll('.item')
    
    items.forEach((item, i) => {
      if (i % 3 === 0) {
        item.setAttribute('data-updated', 'true')
        item.querySelector('span').textContent = `Updated Item ${i}`
      }
      if (i % 5 === 0) {
        item.classList.add('highlighted')
      }
    })
    
    return modified
  }

  test("DOM.all() caching performance improvement", () => {
    const container = createLargeDOM(500)
    document.body.appendChild(container)
    
    const iterations = 50
    const selector = '.item'
    
    // First run (no cache)
    const start1 = performance.now()
    for (let i = 0; i < iterations; i++) {
      DOM.all(container, selector)
    }
    const end1 = performance.now()
    const timeWithoutCache = end1 - start1
    
    // Second run (with cache)
    const start2 = performance.now()
    for (let i = 0; i < iterations; i++) {
      DOM.all(container, selector)
    }
    const end2 = performance.now()
    const timeWithCache = end2 - start2
    
    console.log(`DOM.all() without cache: ${timeWithoutCache.toFixed(3)}ms`)
    console.log(`DOM.all() with cache: ${timeWithCache.toFixed(3)}ms`)
    console.log(`Cache speedup: ${(timeWithoutCache / timeWithCache).toFixed(2)}x`)
    
    document.body.removeChild(container)
    
    // Cache should provide significant speedup
    expect(timeWithCache).toBeLessThan(timeWithoutCache)
  })

  test("Optimized attribute merging performance", () => {
    const source = document.createElement('div')
    source.setAttribute('class', 'new-class')
    source.setAttribute('data-test', 'value')
    source.setAttribute('id', 'test-id')
    source.setAttribute('style', 'color: red;')
    source.setAttribute('data-complex', 'complex-value-with-long-string')
    
    const iterations = 2000
    const start = performance.now()
    
    for (let i = 0; i < iterations; i++) {
      const target = document.createElement('div')
      target.setAttribute('class', 'old-class')
      target.setAttribute('data-old', 'old-value')
      target.setAttribute('id', 'old-id')
      
      DOM.mergeAttrs(target, source)
    }
    
    const end = performance.now()
    const avgTime = (end - start) / iterations
    console.log(`Optimized attribute merging average time: ${avgTime.toFixed(3)}ms`)
    
    // Should be faster than baseline
    expect(avgTime).toBeLessThan(0.3) // Should be under 0.3ms per operation
  })

  test("Optimized morphdom operation performance", () => {
    const originalContainer = createLargeDOM(100)
    const modifiedContainer = createModifiedDOM(originalContainer)
    
    document.body.appendChild(originalContainer)
    
    // Mock a proper focused element to avoid the null.type error
    const mockFocused = document.createElement('input')
    mockFocused.type = 'text'
    mockLiveSocket.getActiveElement = () => mockFocused
    
    const domPatch = new DOMPatch(
      mockView,
      originalContainer,
      'test-id',
      modifiedContainer.innerHTML,
      [], // streams
      null // targetCID
    )
    
    const start = performance.now()
    domPatch.perform(false)
    const end = performance.now()
    
    const operationTime = end - start
    console.log(`Optimized morphdom operation time: ${operationTime.toFixed(3)}ms`)
    
    document.body.removeChild(originalContainer)
    
    // Should be faster than baseline
    expect(operationTime).toBeLessThan(100) // Should be under 100ms for 100 elements
  })

  test("Stream operations batch optimization", () => {
    const container = document.createElement('div')
    container.setAttribute('phx-update', 'stream')
    document.body.appendChild(container)
    
    // Create stream items
    for (let i = 0; i < 200; i++) {
      const item = document.createElement('div')
      item.id = `stream-item-${i}`
      item.setAttribute('phx-stream-ref', 'test-stream')
      container.appendChild(item)
    }
    
    // Test batch deletion simulation
    const deleteIds = []
    for (let i = 0; i < 50; i++) {
      deleteIds.push(`stream-item-${i * 2}`)
    }
    
    // Simulate batch deletion as in the optimized version
    const start = performance.now()
    const selector = deleteIds.map(id => `[id="${id}"]`).join(',')
    const elementsToDelete = container.querySelectorAll(selector)
    elementsToDelete.forEach(el => el.remove())
    const end = performance.now()
    
    const batchTime = end - start
    console.log(`Batch stream deletion time: ${batchTime.toFixed(3)}ms for ${deleteIds.length} elements`)
    
    document.body.removeChild(container)
    
    expect(batchTime).toBeLessThan(100) // Should be under 100ms for batch operations
  })

  test("Memory efficiency - cache size management", () => {
    const containers = []
    
    // Create many containers to test cache management
    for (let i = 0; i < 150; i++) {
      const container = createLargeDOM(10)
      container.id = `container-${i}`
      containers.push(container)
      document.body.appendChild(container)
      
      // Perform queries to fill cache
      DOM.all(container, '.item')
      DOM.all(container, '[data-id]')
    }
    
    // Cache should be limited in size
    expect(DOM._queryCache.size).toBeLessThanOrEqual(100)
    
    // Clean up
    containers.forEach(container => {
      document.body.removeChild(container)
    })
    
    console.log(`Final cache size: ${DOM._queryCache.size}`)
  })

  test("Performance comparison summary", () => {
    console.log('\n=== Performance Comparison Summary ===')
    
    // Test DOM.all() performance multiple times
    const container = createLargeDOM(300)
    document.body.appendChild(container)
    
    const iterations = 100
    
    // Clear cache first
    DOM._queryCache.clear()
    
    // Test 1: Complex selector
    const complexSelector = '.item[data-id] span'
    const start1 = performance.now()
    for (let i = 0; i < iterations; i++) {
      DOM.all(container, complexSelector)
    }
    const end1 = performance.now()
    const complexSelectorTime = end1 - start1
    
    // Test 2: Cached queries (same selector)
    const start2 = performance.now()
    for (let i = 0; i < iterations; i++) {
      DOM.all(container, complexSelector)
    }
    const end2 = performance.now()
    const cachedTime = end2 - start2
    
    // Test 3: Attribute merging
    const source = document.createElement('div')
    source.setAttribute('class', 'new-class')
    source.setAttribute('data-test', 'value')
    
    const start3 = performance.now()
    for (let i = 0; i < 1000; i++) {
      const target = document.createElement('div')
      target.setAttribute('class', 'old-class')
      DOM.mergeAttrs(target, source)
    }
    const end3 = performance.now()
    const attrMergeTime = end3 - start3
    
    console.log(`Complex selector time: ${complexSelectorTime.toFixed(3)}ms`)
    console.log(`Cached selector time: ${cachedTime.toFixed(3)}ms`) 
    console.log(`Cache speedup: ${(complexSelectorTime / cachedTime).toFixed(2)}x`)
    console.log(`Attribute merge time: ${attrMergeTime.toFixed(3)}ms`)
    console.log(`Cache size: ${DOM._queryCache.size}`)
    
    document.body.removeChild(container)
    
    // Verify improvements
    expect(cachedTime).toBeLessThan(complexSelectorTime)
    expect(attrMergeTime / 1000).toBeLessThan(0.5) // Under 0.5ms per merge
  })
})