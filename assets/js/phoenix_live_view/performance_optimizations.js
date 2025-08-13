// Performance optimizations for Phoenix LiveView DOM operations
import {
  PHX_REF,
  PHX_REF_SRC
} from "./constants"

// Query result caching system
const queryCache = new Map()
const cacheTimeouts = new Map()
const CACHE_TTL = 100 // Cache for 100ms

// Optimized DOM.all with caching
function optimizedDOMAll(node, query, callback) {
  if (!node) { return [] }
  
  // Create cache key based on node and query
  const nodeId = node.id || node.tagName + (node.className || '')
  const cacheKey = `${nodeId}:${query}`
  
  // Check cache first
  const cached = queryCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return callback ? cached.results.forEach(callback) : cached.results
  }
  
  // Perform query and cache result
  const array = Array.from(node.querySelectorAll(query))
  queryCache.set(cacheKey, {
    results: array,
    timestamp: Date.now()
  })
  
  // Clear old cache entries
  if (queryCache.size > 100) { // Limit cache size
    const now = Date.now()
    for (const [key, value] of queryCache) {
      if (now - value.timestamp > CACHE_TTL) {
        queryCache.delete(key)
      }
    }
  }
  
  return callback ? array.forEach(callback) : array
}

// Optimized attribute merging with batch operations
function optimizedMergeAttrs(target, source, opts = {}) {
  const exclude = new Set(opts.exclude || [])
  const isIgnored = opts.isIgnored
  
  // Batch attribute operations to reduce DOM access
  const attributesToSet = []
  const attributesToRemove = []
  
  // First pass: collect source attributes to set
  const sourceAttrs = source.attributes
  for (let i = 0; i < sourceAttrs.length; i++) {
    const attr = sourceAttrs[i]
    const name = attr.name
    
    if (!exclude.has(name)) {
      const sourceValue = attr.value
      if (target.getAttribute(name) !== sourceValue && (!isIgnored || (isIgnored && name.startsWith("data-")))) {
        attributesToSet.push([name, sourceValue])
      }
    } else if (name === "value" && target.value === source.value) {
      attributesToSet.push([name, attr.value])
    }
  }
  
  // Second pass: collect target attributes to remove
  const targetAttrs = target.attributes
  for (let i = 0; i < targetAttrs.length; i++) {
    const name = targetAttrs[i].name
    if (isIgnored) {
      if (name.startsWith("data-") && !source.hasAttribute(name) && ![PHX_REF, PHX_REF_SRC].includes(name)) {
        attributesToRemove.push(name)
      }
    } else {
      if (!source.hasAttribute(name)) {
        attributesToRemove.push(name)
      }
    }
  }
  
  // Batch apply changes
  attributesToSet.forEach(([name, value]) => target.setAttribute(name, value))
  attributesToRemove.forEach(name => target.removeAttribute(name))
}

// Object pool for reusing objects to reduce allocations
class ObjectPool {
  constructor(createFn, resetFn) {
    this.createFn = createFn
    this.resetFn = resetFn
    this.pool = []
  }
  
  get() {
    if (this.pool.length > 0) {
      return this.pool.pop()
    }
    return this.createFn()
  }
  
  release(obj) {
    if (this.resetFn) {
      this.resetFn(obj)
    }
    this.pool.push(obj)
  }
}

// Pool for commonly used arrays
const arrayPool = new ObjectPool(
  () => [],
  (arr) => { arr.length = 0 }
)

// Optimized stream operations with reused arrays
function optimizedStreamReorder(container, item, streamAt) {
  if (!item.parentElement) return
  
  const children = container.children // Use live HTMLCollection instead of Array.from
  
  if (streamAt === 0) {
    if (children[0] !== item) {
      container.insertBefore(item, children[0])
    }
  } else if (streamAt > 0) {
    const targetIndex = Math.min(streamAt, children.length - 1)
    const currentIndex = Array.prototype.indexOf.call(children, item)
    
    if (currentIndex !== targetIndex) {
      if (targetIndex >= children.length - 1) {
        container.appendChild(item)
      } else {
        const sibling = children[targetIndex]
        if (currentIndex > targetIndex) {
          container.insertBefore(item, sibling)
        } else {
          container.insertBefore(item, sibling.nextElementSibling)
        }
      }
    }
  }
}

// Batch DOM updates using DocumentFragment
function batchDOMUpdates(container, updates) {
  const fragment = document.createDocumentFragment()
  
  // Remove all elements from container and add to fragment
  updates.forEach(update => {
    if (update.type === 'add') {
      fragment.appendChild(update.element)
    }
  })
  
  // Apply all changes at once
  container.appendChild(fragment)
}

// Optimized private operations with WeakMap
const optimizedPrivateStore = new WeakMap()

function optimizedPutPrivate(el, key, value) {
  let privateObj = optimizedPrivateStore.get(el)
  if (!privateObj) {
    privateObj = {}
    optimizedPrivateStore.set(el, privateObj)
  }
  privateObj[key] = value
}

function optimizedGetPrivate(el, key) {
  const privateObj = optimizedPrivateStore.get(el)
  return privateObj ? privateObj[key] : undefined
}

function optimizedDeletePrivate(el, key) {
  const privateObj = optimizedPrivateStore.get(el)
  if (privateObj) {
    delete privateObj[key]
  }
}

// Debounced function execution to reduce frequent calls
function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

// Optimized morphdom configuration
function getOptimizedMorphdomConfig(targetContainer, isJoinPatch) {
  // Pre-compile frequently used functions
  const isPhxDestroyed = (node) => {
    return node.id && optimizedGetPrivate(node, "destroyed")
  }
  
  const getNodeKey = (node) => {
    if (isPhxDestroyed(node)) return null
    if (isJoinPatch) return node.id
    return node.id || (node.getAttribute && node.getAttribute("phx-magic-id"))
  }
  
  return {
    childrenOnly: targetContainer.getAttribute("phx-component") === null,
    getNodeKey,
    skipFromChildren: (from) => from.getAttribute("phx-update") === "stream",
    // Other morphdom config options...
  }
}

export {
  optimizedDOMAll,
  optimizedMergeAttrs,
  optimizedStreamReorder,
  batchDOMUpdates,
  optimizedPutPrivate,
  optimizedGetPrivate,
  optimizedDeletePrivate,
  ObjectPool,
  arrayPool,
  debounce,
  getOptimizedMorphdomConfig,
  queryCache
}