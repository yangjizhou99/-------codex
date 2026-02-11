import jieba
import jieba.posseg as pseg
from collections import Counter

# 1. 强制分词 (保留此修复以统一句式)
# 这样 "看书" -> "看/v 书/n", "喝咖啡" -> "喝/v 咖啡/n"
# 从而确保 N-gram 也能提取出连续的 <verb> <noun>
jieba.suggest_freq(('看', '书'), True)
jieba.suggest_freq(('喝', '咖啡'), True)
jieba.suggest_freq(('吃', '苹果'), True)
jieba.suggest_freq(('吃', '西瓜'), True)

# 2. 扩大的词性映射 (保留)
ABSTRACT_POS = {
    'n': '<noun>', 'nr': '<noun>', 'nz': '<noun>', 'ng': '<noun>',
    'v': '<verb>', 'vd': '<verb>', 'vn': '<verb>', 'vq': '<verb>',
    'a': '<adj>', 'ad': '<adj>', 'an': '<adj>', 'ag': '<adj>',
    't': '<time>', 'tg': '<time>',
    's': '<loc>', 'ns': '<loc>',
    'nt': '<org>',
    'm': '<num>',
    'q': '<quant>',
    'r': '<pron>', 
}

# 3. 静态白名单 (保留代词泛化策略: 只保留第一人称)
STATIC_KEEP_WORDS = {
    "我", "我们",
    "是", "有", "在", "去", "来",
    "的", "了", "吗", "呢", "啊", "吧",
    "就", "也", "都", "还", "只是", "经常", "然后", "结果", "但是", "可是",
    "喜欢", "想", "要", "觉得", "那个", "首先", "其次", "因为", "所以", "如果",
}

def get_dynamic_whitelist(sentences, min_support):
    """
    第一遍扫描：统计词频，找出高频实词 (保留)
    """
    word_counts = Counter()
    for text in sentences:
        words = pseg.cut(text)
        for word, flag in words:
            if flag == 'x' or word in STATIC_KEEP_WORDS:
                continue
            word_counts[word] += 1
            
    dynamic_whitelist = {word for word, count in word_counts.items() if count >= min_support}
    return dynamic_whitelist

def abstract_sentence(text, dynamic_whitelist):
    """
    抽象化 (保留)
    """
    words = pseg.cut(text)
    sequence = []
    
    for word, flag in words:
        if flag == 'x':
            continue

        if word in STATIC_KEEP_WORDS or word in dynamic_whitelist:
            sequence.append(word)
            continue
        
        main_tag = flag[0]
        if flag in ABSTRACT_POS:
            token = ABSTRACT_POS[flag]
            sequence.append(token)
        elif main_tag in ABSTRACT_POS:
            token = ABSTRACT_POS[main_tag]
            sequence.append(token)
        else:
            sequence.append(word)
            
    return sequence

def generate_ngrams(sequence, min_len=2, max_len=10):
    """
    生成一个序列的所有 N-gram (连续切片)
    """
    ngrams = []
    seq_len = len(sequence)
    for n in range(min_len, min(seq_len + 1, max_len + 1)):
        for i in range(seq_len - n + 1):
            ngram = tuple(sequence[i:i+n])
            ngrams.append(ngram)
    return ngrams

def mine_patterns(sentences, min_support=2, min_len=2):
    """
    挖掘频繁模式 (Switch back to N-gram Contiguous Mining)
    """
    # 1. 动态白名单
    dynamic_whitelist = get_dynamic_whitelist(sentences, min_support)
    
    # 2. 收集 N-grams
    ngram_counts = Counter()
    abstract_sequences = [] 
    
    for sent in sentences:
        seq = abstract_sentence(sent, dynamic_whitelist)
        abstract_sequences.append({"original": sent, "seq": seq})
        
        if not seq:
            continue
            
        ngrams = generate_ngrams(seq, min_len=min_len)
        ngram_counts.update(ngrams)
    
    # 3. 初步筛选
    frequent_patterns = []
    for pattern_tuple, count in ngram_counts.items():
        if count >= min_support:
            frequent_patterns.append({
                "raw_pattern": list(pattern_tuple),
                "count": count,
                "template": " ".join(pattern_tuple)
            })
            
    # 4. 深度去重 (Subsequence Filtering for Contiguous Patterns)
    # 逻辑: 如果 A 是 B 的子串 (substring) 且 count(A) <= 1.1 * count(B)，则 A 是冗余的。
    frequent_patterns.sort(key=lambda x: len(x["raw_pattern"]), reverse=True)
    
    unique_patterns = []
    for p in frequent_patterns:
        is_redundant = False
        p_str = " ".join(p["raw_pattern"])
        
        for existing in unique_patterns:
            ex_str = " ".join(existing["raw_pattern"])
            
            # Substring check
            if p_str in ex_str:
                if p["count"] <= existing["count"] * 1.1:
                    is_redundant = True
                    break
        
        if not is_redundant:
            # 计算分数
            real_word_count = sum(1 for w in p["raw_pattern"] if not (w.startswith('<') and w.endswith('>')))
            length_score = len(p["raw_pattern"])
            content_weight = 1.0 + (0.5 * real_word_count)
            score = p["count"] * (length_score ** 1.5) * content_weight
            
            p["score"] = score
            unique_patterns.append(p)
            
    # 5. 排序
    unique_patterns.sort(key=lambda x: x["score"], reverse=True)
    
    # 6. 找回例句 (Strict Contiguous Match)
    for p in unique_patterns:
        p["examples"] = []
        pat_tuple = tuple(p["raw_pattern"])
        pat_len = len(pat_tuple)
        
        for item in abstract_sequences:
            seq = item["seq"]
            # Find exact contiguous match
            found = False
            for i in range(len(seq) - pat_len + 1):
                if tuple(seq[i:i+pat_len]) == pat_tuple:
                    found = True
                    break
            
            if found:
                if len(p["examples"]) < 3:
                    p["examples"].append(item["original"])

    return unique_patterns
